import { brokers, brokerPortrait, ratingStars } from "./data/brokers.js";
import locations from "./data/locations.json";
import { propertyTypes, ranges, articles } from "./data/catalog.js";
import { seeds } from "./data/seeds.js";
import {
  initialize,
  getClient,
  getConfig,
  sendLead,
  listingImage,
  safeAuthError,
} from "./backend.js";
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const normalize = (s) =>
  String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase();
function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
let saved = new Set(read("ct-saved", []).map(String)),
  posts = [],
  myPosts = [],
  session = null,
  limit = 6,
  savedOnly = false,
  purpose = "rent",
  loadError = false,
  authPending = false,
  loadRevision = 0,
  activeAuthMode = "login";
const opts = (values, first = "", selected = "") =>
  (first ? `<option value="">${esc(first)}</option>` : "") +
  values
    .map(
      (v) =>
        `<option value="${esc(v)}" ${v === selected ? "selected" : ""}>${esc(v)}</option>`,
    )
    .join("");
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(
    () => $("#toast").classList.remove("show"),
    4500,
  );
}
function status(selector, message) {
  const el = $(selector);
  if (el) el.textContent = message;
}
function open(content) {
  $("#modalContent").innerHTML = content;
  if (!$("#modal").open) $("#modal").showModal();
}
function emptyHint() {
  return getConfig().ready
    ? "Chưa có tin phù hợp. Hãy thử bộ lọc khác."
    : "Chưa có tin thật. Tin mẫu chỉ dùng để xem giao diện.";
}
function districtOptions(city, selected = "") {
  const districts = locations.find((x) => x.name === city)?.districts || [];
  return opts(districts, "Tất cả quận / huyện", selected);
}
function updateDistrict() {
  const el = $("#districtFilter");
  el.innerHTML = districtOptions($("#city").value);
  el.disabled = !$("#city").value;
}
function updatePrices() {
  const value = $("#priceFilter").value;
  $("#priceFilter").innerHTML = ranges[purpose]
    .map(([v, label]) => `<option value="${v}">${label}</option>`)
    .join("");
  if (ranges[purpose].some(([v]) => v === value))
    $("#priceFilter").value = value;
}
function priceText(p) {
  return p.purpose === "sale"
    ? p.price >= 1000
      ? `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(p.price / 1000)} tỷ`
      : `${p.price} triệu`
    : `${new Intl.NumberFormat("vi-VN").format(p.price)} triệu`;
}
function all() {
  return [...posts, ...($("#showDemo").checked ? seeds : [])];
}
function matches() {
  let list = all().filter((p) => {
    const q = normalize($("#keyword").value.trim()),
      range = $("#priceFilter").value,
      area = $("#areaFilter").value;
    let priceOK = true;
    if (range) {
      const [low, high] = range.split("-");
      priceOK = p.price >= Number(low) && (!high || p.price < Number(high));
    }
    return (
      p.purpose === purpose &&
      (!q ||
        normalize(
          p.title + " " + p.address + " " + p.city + " " + p.district,
        ).includes(q)) &&
      (!$("#city").value || p.city === $("#city").value) &&
      (!$("#districtFilter").value ||
        p.district === $("#districtFilter").value) &&
      (!$("#typeFilter").value || p.type === $("#typeFilter").value) &&
      priceOK &&
      (!area || (area === "100" ? p.area < 100 : p.area >= 100)) &&
      (!savedOnly || saved.has(String(p.id)))
    );
  });
  if ($("#sort").value === "low") list.sort((a, b) => a.price - b.price);
  if ($("#sort").value === "high") list.sort((a, b) => b.price - a.price);
  return list;
}
function render() {
  const list = matches();
  $("#savedCount").textContent = saved.size;
  $("#showSaved").style.color = savedOnly ? "#1877f2" : "";
  $("#resultCount").textContent =
    `${list.length} bất động sản ${savedOnly ? "đã lưu" : "phù hợp"} · ${$("#city").value || "Toàn quốc"}`;
  $("#listingsTitle").innerHTML =
    `Bất động sản ${purpose === "sale" ? "bán" : "cho thuê"} nổi bật<span class="blue-dot">.</span>`;
  $("#grid").innerHTML =
    list
      .slice(0, limit)
      .map(
        (p) =>
          `<article class="card"><div class="card-image" data-detail="${esc(p.id)}" role="button" tabindex="0" aria-label="Xem ${esc(p.title)}"><img src="${esc(p.image || "/property-placeholder.svg")}" alt="${esc(p.title)}" loading="lazy"><span class="badge ${p.demo ? "" : "featured"}">${p.demo ? "TIN MINH HỌA" : p.purpose === "sale" ? "ĐANG BÁN" : "ĐANG CHO THUÊ"}</span></div><div class="card-body"><div class="card-type">${esc(p.type)} <button class="save-inline" data-save="${esc(p.id)}" aria-label="${saved.has(String(p.id)) ? "Bỏ lưu" : "Lưu"} tin" aria-pressed="${saved.has(String(p.id))}">${saved.has(String(p.id)) ? "♥" : "♡"}</button></div><h3><button data-detail="${esc(p.id)}">${esc(p.title)}</button></h3><p class="card-location">⌖ ${esc(p.address)}, ${esc(p.city)}</p><div class="card-price"><span>${priceText(p)} <small>${p.purpose === "sale" ? "" : "/ tháng"}</small></span><span>▱ ${p.area} m²</span></div><div class="features"><span>▤ ${p.rooms} phòng</span><span>◇ ${esc(p.district)}</span></div><div class="card-bottom"><span class="agent"><span class="agent-circle">${esc(
            p.agent
              .split(" ")
              .map((x) => x[0])
              .slice(-2)
              .join(""),
          )}</span>${esc(p.agent)}</span><span>${p.demo ? "Tin minh họa" : "Môi giới đăng tin"}</span></div></div></article>`,
      )
      .join("") ||
    `<div class="empty">${loadError ? "Chưa tải được tin từ máy chủ. Vui lòng thử lại." : emptyHint()}<br><button class="outline" id="emptyReset">Xóa bộ lọc</button>${loadError ? '<button class="primary" id="retryListings">Tải lại tin</button>' : ""}</div>`;
  $("#moreBtn").hidden = limit >= list.length;
  $("#emptyReset")?.addEventListener("click", reset);
  $("#retryListings")?.addEventListener("click", loadListings);
}
function reset() {
  for (const id of [
    "keyword",
    "city",
    "typeFilter",
    "priceFilter",
    "areaFilter",
  ])
    $("#" + id).value = "";
  $("#sort").value = "new";
  savedOnly = false;
  limit = 6;
  updateDistrict();
  $$(".search-tabs button").forEach((b, i) =>
    b.classList.toggle("selected", i === 0),
  );
  render();
}
function setPurpose(value) {
  purpose = value;
  reset();
  updatePrices();
  $$("[data-purpose]").forEach((b) =>
    b.classList.toggle("active", b.dataset.purpose === value),
  );
  render();
  $("#listings").scrollIntoView();
}
async function loadListings() {
  if (!getClient()) return;
  const revision = ++loadRevision;
  try {
    const { data, error } = await getClient()
      .from("listings")
      .select("*")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(300);
    if (revision !== loadRevision) return;
    if (error) throw error;
    posts = data.map((p) => ({ ...p, image: listingImage(p.image_path) }));
    loadError = false;
  } catch {
    loadError = true;
    toast("Chưa tải được tin thật. Vui lòng thử lại.");
  }
  render();
}
function contact(channel, p) {
  if (p && !p.demo) {
    const tel = p.phone.replace(/\s/g, "");
    const zalo = tel.replace(/^\+84/, "0");
    open(
      `<div class="overline">LIÊN HỆ NGƯỜI ĐĂNG</div><h2>${esc(p.agent)}</h2><p>${esc(p.title)}</p><a class="primary" href="tel:${esc(tel)}">Gọi ${esc(p.phone)}</a> <a class="outline" href="https://zalo.me/${esc(zalo)}" target="_blank" rel="noopener noreferrer">Nhắn Zalo</a><p>Xác minh thông tin và xem bất động sản trước khi chuyển tiền.</p>`,
    );
    return;
  }
  open(
    `<div class="overline">KẾT NỐI CHUYÊN GIA</div><h2>${esc(channel)} tư vấn</h2><p>${p?.demo ? "Đây là tin minh họa, chưa có người đăng để liên hệ." : "Số điện thoại và tài khoản Zalo chính thức của đơn vị vận hành chưa được cấu hình."}</p><a class="primary" href="#needs" id="toNeeds">Gửi nhu cầu thuê →</a>`,
  );
  $("#toNeeds").onclick = () => $("#modal").close();
}
function detail(id) {
  const p = all().find((x) => String(x.id) === String(id));
  if (!p) return;
  open(
    `<img src="${esc(p.image)}" alt="${esc(p.title)}"><div class="overline">${esc(p.type)} · ${p.demo ? "TIN MINH HỌA" : p.purpose === "sale" ? "NHÀ ĐẤT BÁN" : "NHÀ ĐẤT CHO THUÊ"}</div><h2>${esc(p.title)}</h2><p>⌖ ${esc(p.address)}, ${esc(p.district)}, ${esc(p.city)}</p><h2 class="price-heading">${priceText(p)}${p.purpose === "rent" ? "/tháng" : ""}</h2><p>Diện tích: <strong>${p.area} m²</strong> · ${p.rooms} phòng</p><p class="listing-description">${esc(p.description || "Không gian minh họa, phục vụ trải nghiệm giao diện tìm kiếm. Đây không phải tin đăng thật đã được xác minh.")}</p><small>${p.demo ? "Không liên hệ hoặc chuyển tiền dựa trên tin minh họa." : "Thông tin do người đăng cung cấp. Hãy kiểm tra hồ sơ và hiện trạng trước khi giao dịch."}</small><button class="primary" id="detailContact">Liên hệ người đăng</button>`,
  );
  $("#detailContact").onclick = () => contact("Liên hệ", p);
}
function auth(mode = "login") {
  activeAuthMode = mode;
  const title = {
    login: "Đăng nhập",
    register: "Đăng ký môi giới",
    reset: "Đặt lại mật khẩu",
    recover: "Tạo mật khẩu mới",
  }[mode];
  const ready = getConfig().ready;
  open(
    `<div class="overline">TÀI KHOẢN CHOTHUE.COM.VN</div><h2>${title}</h2><p>${mode === "register" ? "Tạo tài khoản để đăng tin và quản lý bất động sản của bạn." : "Đăng nhập để quản lý tin đăng của bạn."}</p>${!ready ? '<div class="notice">Chức năng tài khoản chưa được kích hoạt. Website đang chờ kết nối cơ sở dữ liệu; chưa thể tạo tài khoản thật.</div>' : ""}<form id="authForm">${mode === "register" ? '<label>Họ tên<input name="full_name" autocomplete="name" required minlength="2" maxlength="80"></label>' : ""}${mode !== "recover" ? '<label>Email<input name="email" autocomplete="email" required type="email" maxlength="254"></label>' : ""}${mode !== "reset" ? `<label>Mật khẩu<input name="password" type="password" required minlength="${mode === "login" ? 1 : 8}" maxlength="128" autocomplete="${mode === "login" ? "current-password" : "new-password"}">${mode === "login" ? "" : "<small>Ít nhất 8 ký tự.</small>"}</label>` : ""}${mode === "register" ? '<label class="consent"><input required type="checkbox"> Tôi đồng ý dùng thông tin tài khoản để đăng tin và nhận thông báo liên quan.</label>' : ""}<p id="authStatus" role="status"></p><button class="primary" type="submit" ${!ready ? "disabled" : ""}>${title}</button></form><div class="auth-switch">${mode === "login" ? '<button id="toRegister">Chưa có tài khoản? Đăng ký</button><button id="forgotPassword">Quên mật khẩu?</button>' : '<button id="toLogin">Quay lại đăng nhập</button>'}</div>`,
  );
  $("#toRegister")?.addEventListener("click", () => auth("register"));
  $("#forgotPassword")?.addEventListener("click", () => auth("reset"));
  $("#toLogin")?.addEventListener("click", () => auth());
  $("#authForm").onsubmit = async (e) => {
    e.preventDefault();
    if (!getClient() || authPending) return;
    authPending = true;
    const btn = e.target.querySelector("[type=submit]");
    btn.disabled = true;
    status("#authStatus", "Đang xử lý…");
    const f = new FormData(e.target);
    try {
      let result;
      if (mode === "login")
        result = await getClient().auth.signInWithPassword({
          email: f.get("email").trim(),
          password: f.get("password"),
        });
      if (mode === "register")
        result = await getClient().auth.signUp({
          email: f.get("email").trim(),
          password: f.get("password"),
          options: {
            data: { full_name: f.get("full_name").trim() },
            emailRedirectTo: location.origin,
          },
        });
      if (mode === "reset")
        result = await getClient().auth.resetPasswordForEmail(
          f.get("email").trim(),
          { redirectTo: location.origin },
        );
      if (mode === "recover")
        result = await getClient().auth.updateUser({
          password: f.get("password"),
        });
      if (result.error) throw result.error;
      if (mode === "register" && !result.data.session) {
        status(
          "#authStatus",
          "Đã tiếp nhận đăng ký. Kiểm tra email để xác nhận tài khoản (nếu email đủ điều kiện đăng ký).",
        );
        e.target.reset();
      } else if (mode === "reset") {
        status(
          "#authStatus",
          "Nếu email có tài khoản, hướng dẫn đặt lại mật khẩu sẽ được gửi.",
        );
      } else {
        $("#modal").close();
        toast(mode === "recover" ? "Đã cập nhật mật khẩu." : "Đã đăng nhập.");
        await updateSession();
        dashboard();
      }
    } catch (error) {
      status("#authStatus", safeAuthError(error));
    } finally {
      authPending = false;
      if (btn.isConnected) btn.disabled = !getConfig().ready;
    }
  };
}
async function updateSession() {
  if (!getClient()) return;
  const { data } = await getClient().auth.getSession();
  session = data.session;
  $("#loginBtn").parentElement.hidden = !!session;
  $("#accountBtn").hidden = !session;
  $("#accountBtn").textContent = session ? "Quản lý tin" : "";
}
async function dashboard() {
  if (!session) {
    auth();
    return;
  }
  open(
    `<div class="overline">KHÔNG GIAN LÀM VIỆC CỦA MÔI GIỚI</div><h2>Quản lý tin đăng</h2><p>${esc(session.user.email)}</p><div class="dashboard-actions"><button class="primary" id="newListing">＋ Đăng tin mới</button><button class="outline" id="viewLeads">Nhu cầu khách hàng</button><button class="outline" id="signOut">Đăng xuất</button></div><div id="myListings" aria-live="polite">Đang tải tin của bạn…</div>`,
  );
  $("#newListing").onclick = () => post();
  $("#viewLeads").onclick = leadDashboard;
  $("#signOut").onclick = async () => {
    const { error } = await getClient().auth.signOut();
    if (error) {
      toast("Chưa thể đăng xuất. Vui lòng thử lại.");
      return;
    }
    session = null;
    myPosts = [];
    await updateSession();
    $("#modal").close();
    toast("Đã đăng xuất.");
  };
  try {
    const { data, error } = await getClient()
      .from("listings")
      .select("*")
      .eq("owner_id", session.user.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    myPosts = data;
    if (!$("#myListings")) return;
    $("#myListings").innerHTML = data.length
      ? data
          .map(
            (p) =>
              `<article class="managed-listing"><div><strong>${esc(p.title)}</strong><p>${p.status === "published" ? "Đang hiển thị" : p.status === "draft" ? "Bản nháp" : "Đã ẩn"} · ${priceText(p)}${p.purpose === "rent" ? "/tháng" : ""}</p></div><div><button class="outline" data-edit="${p.id}">Sửa tin</button><button class="outline" data-toggle="${p.id}">${p.status === "published" ? "Ẩn tin" : "Hiển thị"}</button><button class="danger" data-delete="${p.id}">Xóa</button></div></article>`,
          )
          .join("")
      : '<div class="empty">Bạn chưa có tin đăng. Hãy tạo tin đầu tiên.</div>';
    $$("[data-edit]").forEach(
      (b) =>
        (b.onclick = () => post(myPosts.find((p) => p.id === b.dataset.edit))),
    );
    $$("[data-toggle]").forEach(
      (b) =>
        (b.onclick = async () => {
          b.disabled = true;
          const p = myPosts.find((x) => x.id === b.dataset.toggle);
          const { error } = await getClient()
            .from("listings")
            .update({
              status: p.status === "published" ? "hidden" : "published",
            })
            .eq("id", p.id)
            .eq("owner_id", session.user.id);
          if (error) {
            toast("Chưa cập nhật được tin.");
            b.disabled = false;
            return;
          }
          await loadListings();
          dashboard();
        }),
    );
    $$("[data-delete]").forEach(
      (b) =>
        (b.onclick = () =>
          confirmDelete(myPosts.find((x) => x.id === b.dataset.delete))),
    );
  } catch {
    status(
      "#myListings",
      "Chưa tải được tin. Vui lòng kiểm tra kết nối hoặc cấu trúc cơ sở dữ liệu.",
    );
  }
}
function confirmDelete(p) {
  open(
    `<h2>Xóa tin đăng?</h2><p>${esc(p.title)}</p><p>Tin sẽ không còn hiển thị trên website. Thao tác này không thể hoàn tác.</p><button class="outline" id="cancelDelete">Giữ lại</button> <button class="danger" id="confirmDelete">Xóa tin</button>`,
  );
  $("#cancelDelete").onclick = dashboard;
  $("#confirmDelete").onclick = async (e) => {
    e.target.disabled = true;
    const { error } = await getClient()
      .from("listings")
      .delete()
      .eq("id", p.id)
      .eq("owner_id", session.user.id);
    if (error) {
      toast("Chưa xóa được tin.");
      e.target.disabled = false;
      return;
    }
    await getClient().storage.from("listing-images").remove([p.image_path]);
    await loadListings();
    toast("Đã xóa tin.");
    dashboard();
  };
}
async function post(existing = null) {
  if (!session) {
    auth();
    return;
  }
  const p = existing || {},
    uid = session.user.id;
  open(
    `<div class="overline">DÀNH CHO CHỦ NHÀ & MÔI GIỚI</div><h2>${existing ? "Chỉnh sửa tin" : "Đăng tin nhà đất"}</h2><form id="postForm"><label>Tiêu đề tin<input name="title" required minlength="10" maxlength="140" value="${esc(p.title)}" placeholder="Ví dụ: Căn hộ 2 phòng ngủ tại Cầu Giấy"></label><div class="form-row"><label>Nhu cầu<select name="purpose"><option value="rent" ${p.purpose !== "sale" ? "selected" : ""}>Cho thuê</option><option value="sale" ${p.purpose === "sale" ? "selected" : ""}>Bán</option></select></label><label>Loại nhà đất<select name="type">${opts(propertyTypes, "", p.type)}</select></label></div><div class="form-row"><label>Tỉnh / Thành phố<select name="city" required>${opts(
      locations.map((x) => x.name),
      "Chọn tỉnh / thành phố",
      p.city,
    )}</select></label><label>Quận / Huyện (khu vực cũ)<select name="district" required>${districtOptions(p.city, p.district)}</select></label></div><p class="geo-note">Địa điểm dùng tên khu vực trước sắp xếp năm 2025.</p><label>Địa chỉ cụ thể<input name="address" required minlength="5" maxlength="180" value="${esc(p.address)}"></label><div class="form-row"><label><span id="postPriceLabel">${p.purpose === "sale" ? "Giá bán (triệu đồng)" : "Giá thuê (triệu/tháng)"}</span><input name="price" required type="number" min="0.1" max="1000000000" step="0.1" value="${esc(p.price)}"></label><label>Diện tích (m²)<input name="area" required type="number" min="1" max="1000000" step="0.1" value="${esc(p.area)}"></label></div><label>Số phòng<input name="rooms" required type="number" min="1" max="100" value="${esc(p.rooms || 1)}"></label><label>Ảnh bất động sản${existing ? "<small>Để trống để giữ ảnh hiện tại.</small>" : ""}<input name="image" type="file" accept="image/jpeg,image/png,image/webp" ${existing ? "" : "required"}></label><div class="form-row"><label>Tên người đăng<input name="agent" required minlength="2" maxlength="80" autocomplete="name" value="${esc(p.agent || session.user.user_metadata?.full_name)}"></label><label>Số điện thoại công khai<input name="phone" required type="tel" pattern="[+]?[0-9 ]{9,15}" autocomplete="tel" value="${esc(p.phone)}"></label></div><label>Mô tả<textarea name="description" required minlength="20" rows="4" maxlength="3000">${esc(p.description)}</textarea></label><label>Trạng thái<select name="status"><option value="draft" ${p.status !== "published" ? "selected" : ""}>Lưu bản nháp</option><option value="published" ${p.status === "published" ? "selected" : ""}>Đăng công khai</option><option value="hidden" ${p.status === "hidden" ? "selected" : ""}>Ẩn tin</option></select></label><label class="consent"><input type="checkbox" required> Tôi có quyền đăng bất động sản này và đồng ý công khai tên, số điện thoại, ảnh khi tin được hiển thị.</label><small>Ảnh JPG, PNG hoặc WebP tối đa 2 MB. Không đăng thông tin sai lệch hoặc tài liệu cá nhân nhạy cảm.</small><p role="status" id="postStatus"></p><div class="dashboard-actions"><button class="primary" type="submit">${existing ? "Lưu thay đổi" : "Lưu tin đăng"}</button><button class="outline" type="button" id="backDashboard">Quay lại quản lý tin</button></div></form>`,
  );
  const f = $("#postForm");
  const field = (n) => f.elements.namedItem(n);
  field("city").onchange = () => {
    field("district").innerHTML = districtOptions(field("city").value);
  };
  field("purpose").onchange = () =>
    status(
      "#postPriceLabel",
      field("purpose").value === "sale"
        ? "Giá bán (triệu đồng)"
        : "Giá thuê (triệu/tháng)",
    );
  $("#backDashboard").onclick = dashboard;
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (!session || session.user.id !== uid) return;
    const btn = f.querySelector("[type=submit]");
    btn.disabled = true;
    status("#postStatus", "Đang lưu tin…");
    let newPath = null;
    try {
      const fd = new FormData(f),
        file = fd.get("image");
      if (
        !propertyTypes.includes(fd.get("type")) ||
        !locations.some(
          (x) =>
            x.name === fd.get("city") &&
            x.districts.includes(fd.get("district")),
        )
      )
        throw Error("Vui lòng chọn tỉnh / thành và quận / huyện phù hợp.");
      let path = p.image_path;
      if (file.size) {
        if (
          file.size > 2097152 ||
          !["image/jpeg", "image/png", "image/webp"].includes(file.type)
        )
          throw Error("Ảnh phải là JPG, PNG hoặc WebP, tối đa 2 MB.");
        const ext = {
          "image/jpeg": "jpg",
          "image/png": "png",
          "image/webp": "webp",
        }[file.type];
        newPath = `${uid}/${crypto.randomUUID()}.${ext}`;
        const { error } = await getClient()
          .storage.from("listing-images")
          .upload(newPath, file, { contentType: file.type, upsert: false });
        if (error) throw Error("Chưa thể tải ảnh lên. Vui lòng thử lại.");
        path = newPath;
      }
      if (!path) throw Error("Vui lòng thêm ảnh bất động sản.");
      const payload = Object.fromEntries(
        [
          "title",
          "purpose",
          "type",
          "city",
          "district",
          "address",
          "agent",
          "phone",
          "description",
          "status",
        ].map((k) => [k, String(fd.get(k)).trim()]),
      );
      Object.assign(payload, {
        price: Number(fd.get("price")),
        area: Number(fd.get("area")),
        rooms: Number(fd.get("rooms")),
        image_path: path,
      });
      const query = existing
        ? getClient()
            .from("listings")
            .update(payload)
            .eq("id", p.id)
            .eq("owner_id", uid)
        : getClient()
            .from("listings")
            .insert({ ...payload, owner_id: uid });
      const { data, error } = await query.select("id").single();
      if (error || !data)
        throw Error(
          "Chưa thể lưu tin. Vui lòng kiểm tra quyền truy cập và thử lại.",
        );
      if (newPath && p.image_path)
        await getClient().storage.from("listing-images").remove([p.image_path]);
      newPath = null;
      await loadListings();
      toast("Đã lưu tin trên hệ thống.");
      dashboard();
    } catch (error) {
      if (newPath)
        await getClient().storage.from("listing-images").remove([newPath]);
      status("#postStatus", error.message || "Chưa thể lưu tin.");
    } finally {
      if (btn.isConnected) btn.disabled = false;
    }
  };
}
async function leadDashboard() {
  if (!session) return auth();
  open(
    '<div class="overline">DÀNH CHO QUẢN TRỊ VIÊN</div><h2>Nhu cầu khách hàng</h2><p>Chỉ tài khoản được cấp quyền quản trị mới xem được thông tin khách hàng.</p><button class="outline" id="backAccount">Quay lại tài khoản</button><div id="leadList" aria-live="polite">Đang tải…</div>',
  );
  $("#backAccount").onclick = dashboard;
  try {
    const { data, error } = await getClient()
      .from("leads")
      .select("id,name,phone,need,status,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    if (!$("#leadList")) return;
    $("#leadList").innerHTML = data.length
      ? data
          .map(
            (l) =>
              `<article class="managed-listing lead-card"><div><strong>${esc(l.name)}</strong><p><a href="tel:${esc(l.phone.replace(/\s/g, ""))}">${esc(l.phone)}</a> · ${new Date(l.created_at).toLocaleString("vi-VN")}</p><p class="listing-description">${esc(l.need)}</p><label>Trạng thái<select data-lead="${l.id}">${[
                ["new", "Mới nhận"],
                ["contacted", "Đã liên hệ"],
                ["closed", "Đã hoàn tất"],
              ]
                .map(
                  ([v, t]) =>
                    `<option value="${v}" ${l.status === v ? "selected" : ""}>${t}</option>`,
                )
                .join("")}</select></label></div></article>`,
          )
          .join("")
      : '<div class="empty">Không có nhu cầu để hiển thị, hoặc tài khoản chưa được cấp quyền quản trị.</div>';
    $$("[data-lead]").forEach(
      (el) =>
        (el.onchange = async () => {
          el.disabled = true;
          const previous = data.find((x) => x.id === el.dataset.lead);
          const { data: updated, error } = await getClient()
            .from("leads")
            .update({ status: el.value })
            .eq("id", el.dataset.lead)
            .select("id,status")
            .single();
          if (error || !updated) {
            toast("Chưa cập nhật được trạng thái.");
            el.value = previous.status;
          } else {
            previous.status = updated.status;
            toast("Đã cập nhật trạng thái.");
          }
          el.disabled = false;
        }),
    );
  } catch {
    status(
      "#leadList",
      "Chưa thể tải nhu cầu. Vui lòng kiểm tra quyền quản trị và kết nối.",
    );
  }
}
function privacy() {
  open(
    '<div class="overline">THÔNG TIN CÁ NHÂN</div><h2>Quyền riêng tư</h2><p>Biểu mẫu nhu cầu thu thập tên, số điện thoại và mô tả nhu cầu để bộ phận tư vấn liên hệ hỗ trợ tìm bất động sản. Thông tin này không hiển thị công khai; chỉ tài khoản quản trị được cấp quyền mới có thể xem.</p><p>Tên và số điện thoại trong tin đăng sẽ được công khai khi người đăng chọn hiển thị tin. Môi giới có thể sửa, ẩn hoặc xóa tin trong tài khoản của mình.</p><p>Bạn có thể yêu cầu điều chỉnh hoặc xóa thông tin qua đơn vị vận hành. Thông tin pháp nhân, thời hạn lưu trữ và kênh hỗ trợ chính thức cần được đơn vị vận hành bổ sung trước khi nhận khách hàng thật.</p>',
  );
}
$("#city").innerHTML = opts(
  locations.map((x) => x.name),
  "Toàn quốc",
);
$("#typeFilter").innerHTML = opts(propertyTypes, "Tất cả nhà đất");
updatePrices();
$("#city").onchange = () => {
  updateDistrict();
  limit = 6;
  render();
};
for (const id of [
  "typeFilter",
  "districtFilter",
  "priceFilter",
  "areaFilter",
  "sort",
])
  $("#" + id).onchange = () => {
    limit = 6;
    render();
  };
$("#showDemo").onchange = render;
$("#searchForm").onsubmit = (e) => {
  e.preventDefault();
  savedOnly = false;
  limit = 6;
  render();
  $("#listings").scrollIntoView();
};
$("#resetFilters").onclick = reset;
$("#allListings").onclick = reset;
$("#moreBtn").onclick = () => {
  limit += 6;
  render();
};
$("#showSaved").onclick = () => {
  savedOnly = !savedOnly;
  render();
  $("#listings").scrollIntoView();
};
$$("[data-purpose]").forEach(
  (b) => (b.onclick = () => setPurpose(b.dataset.purpose)),
);
$$("[data-kind]").forEach(
  (b) =>
    (b.onclick = () => {
      $$("[data-kind]").forEach((x) => x.classList.toggle("selected", x === b));
      $("#typeFilter").value = b.dataset.kind;
      render();
    }),
);
$$("[data-query]").forEach(
  (b) =>
    (b.onclick = () => {
      reset();
      $("#keyword").value = b.dataset.query;
      render();
      $("#listings").scrollIntoView();
    }),
);
$$("[data-category],[data-building-type]").forEach(
  (b) =>
    (b.onclick = () => {
      setPurpose("rent");
      $("#typeFilter").value = b.dataset.category || b.dataset.buildingType;
      render();
    }),
);
$("#postBtn").onclick = () => post();
$("#postBottom").onclick = () => post();
$("#loginBtn").onclick = () => auth();
$("#registerBtn").onclick = () => auth("register");
$("#accountBtn").onclick = dashboard;
$("#privacyBtn").onclick = privacy;
$("#closeModal").onclick = () => $("#modal").close();
$("#modal").onclick = (e) => {
  if (e.target === $("#modal")) {
    const r = e.target.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      e.target.close();
  }
};
document.addEventListener("click", (e) => {
  const s = e.target.closest("[data-save]");
  if (s) {
    const id = s.dataset.save;
    const next = new Set(saved);
    next.has(id) ? next.delete(id) : next.add(id);
    try {
      localStorage.setItem("ct-saved", JSON.stringify([...next]));
      saved = next;
      render();
    } catch {
      toast("Trình duyệt không cho phép lưu tin.");
    }
    return;
  }
  const c = e.target.closest("[data-contact]");
  if (c) {
    contact(c.dataset.contact);
    return;
  }
  const d = e.target.closest("[data-detail]");
  if (d) detail(d.dataset.detail);
});
document.addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches(".card-image")) {
    e.preventDefault();
    detail(e.target.dataset.detail);
  }
});
const cities = [
  [
    "TP. Hồ Chí Minh",
    "Nhịp sống năng động, cơ hội rộng mở",
    "photo-1583417319070-4a69db38a482",
  ],
  ["Hà Nội", "Không gian giữa lòng thủ đô", "photo-1509030450996-dd1a26dda07a"],
  ["Đà Nẵng", "Thành phố đáng sống bên biển", "photo-1559592413-7cec4d0cae2b"],
  [
    "Cần Thơ",
    "Kết nối miền Tây thịnh vượng",
    "photo-1528127269322-539801943592",
  ],
];
$("#locationGrid").innerHTML = cities
  .map(
    ([name, sub, img]) =>
      `<button class="city-card" data-city="${name}"><img loading="lazy" src="https://images.unsplash.com/${img}?auto=format&fit=crop&w=600&q=85" alt="Điểm đến ${name}"><div><strong>${name}</strong><small>${sub}</small></div><b>↗</b></button>`,
  )
  .join("");
$$("[data-city]").forEach(
  (b) =>
    (b.onclick = () => {
      reset();
      $("#city").value = b.dataset.city;
      updateDistrict();
      render();
      $("#listings").scrollIntoView();
    }),
);
for (const [selector, type] of [
  ["#newsGrid", "news"],
  ["#wikiGrid", "wiki"],
]) {
  $(selector).innerHTML = articles
    .filter((a) => a.type === type)
    .map(
      (a) =>
        `<article><span class="article-tag">${type === "news" ? "KINH NGHIỆM" : "HƯỚNG DẪN"}</span><h3>${esc(a.title)}</h3><p>${esc(a.excerpt)}</p><button data-article="${a.id}">Đọc bài viết →</button></article>`,
    )
    .join("");
}
$$("[data-article]").forEach(
  (b) =>
    (b.onclick = () => {
      const a = articles.find((x) => x.id === b.dataset.article);
      open(
        `<div class="overline">CHOTHUE.COM.VN · KIẾN THỨC THAM KHẢO</div><h2>${esc(a.title)}</h2>${a.body.map((p) => `<p>${esc(p)}</p>`).join("")}`,
      );
    }),
);
$("#needsForm").onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target,
    fd = new FormData(f),
    btn = f.querySelector("[type=submit]");
  if (!getConfig().leadsReady) {
    status(
      "#leadStatus",
      "Chức năng nhận nhu cầu đang chờ kết nối. Thông tin chưa được gửi hoặc lưu lên máy chủ.",
    );
    return;
  }
  btn.disabled = true;
  status("#leadStatus", "Đang gửi nhu cầu…");
  try {
    const result = await sendLead({
      name: fd.get("name"),
      phone: fd.get("phone"),
      need: fd.get("need"),
      consent: fd.get("consent") === "on",
      website: fd.get("website"),
    });
    status("#leadStatus", result.message);
    f.reset();
  } catch (error) {
    status(
      "#leadStatus",
      error.message || "Chưa thể gửi nhu cầu. Vui lòng thử lại sau.",
    );
  } finally {
    btn.disabled = false;
  }
};
render();
async function boot() {
  const config = await initialize();
  const banner = $("#serviceBanner");
  if (!config.ready) {
    banner.hidden = false;
    banner.textContent =
      "Tài khoản môi giới và nhận nhu cầu đang chờ kết nối hệ thống. Bạn có thể trải nghiệm tìm kiếm với các tin minh họa.";
  }
  status(
    "#leadHint",
    config.leadsReady
      ? "Nhu cầu được lưu vào hệ thống riêng tư để quản trị viên liên hệ tư vấn."
      : "Chưa kết nối nhận nhu cầu thật. Thông tin chưa được gửi đến tư vấn.",
  );
  if (!config.ready) return;
  if ($("#authForm")) auth(activeAuthMode);
  getClient().auth.onAuthStateChange((event, newSession) => {
    session = newSession;
    setTimeout(() => {
      updateSession();
      if (event === "PASSWORD_RECOVERY") auth("recover");
    }, 0);
  });
  await updateSession();
  await loadListings();
}
boot();

document.addEventListener(
  "error",
  (e) => {
    if (
      e.target instanceof HTMLImageElement &&
      !e.target.src.endsWith("/property-placeholder.svg")
    )
      e.target.src = "/property-placeholder.svg";
  },
  true,
);

const brokerGrid = $("#brokerGrid");
brokerGrid.innerHTML = brokers.map(b => `<article class="broker-card"><div class="broker-card-top">${brokerPortrait(b)}<span class="broker-profile-label">HỒ SƠ MINH HỌA</span></div><div class="broker-card-body"><h3>${esc(b.name)}</h3><p class="broker-role">${esc(b.role)}</p><div class="broker-rating">${ratingStars}<strong>5.0<span>/5</span></strong><small>Đánh giá minh họa</small></div><p class="broker-city">⌖ ${esc(b.city)}</p><p class="broker-area">${esc(b.area)}</p><p class="broker-specialty">${esc(b.specialty)}</p><div class="broker-tags">${b.tags.map(tag=>`<span>${esc(tag)}</span>`).join('')}</div><button class="outline broker-profile-button" data-broker="${b.id}">Xem hồ sơ &nbsp; →</button></div></article>`).join('');
$$('[data-broker]').forEach(button=>button.onclick=()=>{const b=brokers.find(b=>b.id===button.dataset.broker);open(`<div class="broker-modal-top">${brokerPortrait(b)}<div><div class="overline">NHÂN VẬT TỰ TẠO · HỒ SƠ MINH HỌA</div><h2>${esc(b.name)}</h2><p>${esc(b.role)}</p></div></div><div class="broker-rating">${ratingStars}<strong>5.0/5</strong><small>Đánh giá minh họa</small></div><p><strong>Khu vực:</strong> ${esc(b.city)} — ${esc(b.area)}</p><p><strong>Chuyên môn:</strong> ${esc(b.specialty)}</p><p>${esc(b.style)}</p><div class="notice">Đây là nhân vật hư cấu phục vụ bản demo. Chưa có số điện thoại, Zalo hoặc dịch vụ tư vấn thật của nhân vật này.</div><a class="primary" href="#needs" id="brokerNeeds">Xem form nhu cầu chung →</a>`);$('#brokerNeeds').onclick=()=>$('#modal').close()});
