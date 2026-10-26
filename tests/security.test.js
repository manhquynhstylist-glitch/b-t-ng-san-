import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import handler, { validateLead } from "../api/leads.js";
import config from "../api/config.js";

const owner = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
test("database enforces ownership, private leads, atomic rate limits, and schema repeatability", async () => {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant usage on schema storage to anon,authenticated;grant select,insert,delete on storage.objects to anon,authenticated;
 create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
 insert into auth.users values('${owner}'),('${other}');`);
  const schema = await readFile(
    new URL("../supabase/schema.sql", import.meta.url),
    "utf8",
  );
  await db.exec(schema);
  await db.exec(schema);
  const act = async (role, uid = "") => {
    await db.exec(
      `reset role;set role ${role};select set_config('request.jwt.claim.sub','${uid}',false)`,
    );
  };
  const listing = {
    owner_id: owner,
    title: "Căn hộ kiểm tra quyền truy cập",
    purpose: "rent",
    type: "Căn hộ chung cư",
    city: "Hà Nội",
    district: "Quận Cầu Giấy",
    address: "Đường kiểm thử số 1",
    price: 15,
    area: 60,
    rooms: 2,
    agent: "Người thử nghiệm",
    phone: "0900000000",
    description: "Thông tin thử nghiệm cho bộ kiểm tra bảo mật.",
    image_path: `${owner}/test.jpg`,
    status: "draft",
  };
  async function insert(p) {
    const keys = Object.keys(p);
    return db.query(
      `insert into public.listings(${keys.join(",")}) values(${keys.map((_, i) => "$" + (i + 1)).join(",")}) returning id`,
      Object.values(p),
    );
  }
  await act("authenticated", owner);
  const row = await insert(listing);
  const id = row.rows[0].id;
  await act("authenticated", other);
  assert.equal(
    (await db.query("select * from public.listings")).rows.length,
    0,
  );
  assert.equal(
    (
      await db.query(
        "update public.listings set title=$1 where id=$2 returning id",
        ["Changed by other user", id],
      )
    ).rows.length,
    0,
  );
  assert.equal(
    (
      await db.query("delete from public.listings where id=$1 returning id", [
        id,
      ])
    ).rows.length,
    0,
  );
  await assert.rejects(
    () => insert({ ...listing, owner_id: owner, status: "published" }),
    /row-level security/,
  );
  await assert.rejects(
    () =>
      insert({ ...listing, owner_id: other, image_path: `${owner}/steal.jpg` }),
    /check constraint/,
  );
  await act("anon");
  assert.equal(
    (await db.query("select * from public.listings")).rows.length,
    0,
  );
  await assert.rejects(
    () =>
      db.query("select public.submit_lead($1,$2,$3,$4)", [
        "Guest",
        "0900000000",
        "Nhu cầu thử nghiệm đủ dài",
        "a".repeat(64),
      ]),
    /permission denied/,
  );
  await assert.rejects(
    () => db.query("select * from public.leads"),
    /permission denied/,
  );
  await act("authenticated", owner);
  await db.query("update public.listings set status='published' where id=$1", [
    id,
  ]);
  await act("anon");
  assert.equal(
    (await db.query("select * from public.listings")).rows.length,
    1,
  );
  await act("service_role");
  for (let i = 0; i < 5; i++)
    assert.equal(
      (
        await db.query("select public.submit_lead($1,$2,$3,$4) as accepted", [
          "Guest",
          "0900000000",
          "Cần thuê căn hộ tại Hà Nội",
          "a".repeat(64),
        ])
      ).rows[0].accepted,
      true,
    );
  assert.equal(
    (
      await db.query("select public.submit_lead($1,$2,$3,$4) as accepted", [
        "Guest",
        "0900000000",
        "Cần thuê căn hộ tại Hà Nội",
        "a".repeat(64),
      ])
    ).rows[0].accepted,
    false,
  );
  await act("authenticated", owner);
  assert.equal((await db.query("select * from public.leads")).rows.length, 0);
  await assert.rejects(
    () =>
      db.query("insert into public.account_roles values($1,'admin')", [owner]),
    /permission denied/,
  );
  await db.exec("reset role");
  await db.query("insert into public.account_roles values($1,'admin')", [
    owner,
  ]);
  await act("authenticated", owner);
  assert.equal((await db.query("select * from public.leads")).rows.length, 5);
  await db.query("update public.leads set status='contacted'");
  await assert.rejects(
    () => db.query("update public.leads set phone='0999999999'"),
    /permission denied/,
  );
  await act("authenticated", other);
  assert.equal(
    (await db.query("update public.leads set status='closed' returning id"))
      .rows.length,
    0,
  );
  await db.query("insert into storage.objects(bucket_id,name) values($1,$2)", [
    "listing-images",
    `${other}/ok.webp`,
  ]);
  await assert.rejects(
    () =>
      db.query("insert into storage.objects(bucket_id,name) values($1,$2)", [
        "listing-images",
        `${owner}/bad.webp`,
      ]),
    /row-level security/,
  );
  await db.close();
});
test("lead validation rejects malformed requests and missing consent", () => {
  const valid = {
    name: "Khách hàng",
    phone: "0900000000",
    need: "Cần thuê căn hộ tại Hà Nội",
    consent: true,
  };
  assert.ok(validateLead(valid));
  for (const edit of [
    { name: " " },
    { phone: "abc" },
    { need: "short" },
    { consent: false },
    { consent: "true" },
    { name: 12 },
    { need: "x".repeat(2001) },
  ])
    assert.equal(validateLead({ ...valid, ...edit }), null);
  assert.equal(validateLead(null), null);
});
function response() {
  return {
    code: 200,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(c) {
      this.code = c;
      return this;
    },
    json(v) {
      this.body = v;
      return this;
    },
  };
}
test("lead endpoint refuses unconfigured storage without false success", async () => {
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const res = response();
    await handler(
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: {},
      },
      res,
    );
    assert.equal(res.code, 503);
    assert.match(res.body.error, /chưa được kết nối/);
  } finally {
    if (url !== undefined) process.env.SUPABASE_URL = url;
    if (key !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = key;
  }
});
test("config endpoint only exposes public settings", () => {
  const previous = {
    ...Object.fromEntries(
      ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"].map(
        (k) => [k, process.env[k]],
      ),
    ),
  };
  Object.assign(process.env, {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_ANON_KEY: "public-key",
    SUPABASE_SERVICE_ROLE_KEY: "private-never-return",
  });
  try {
    const res = response();
    config({ method: "GET" }, res);
    assert.equal(res.body.ready, true);
    assert.equal(res.body.leadsReady, true);
    assert.ok(!JSON.stringify(res.body).includes("private-never-return"));
  } finally {
    for (const [k, v] of Object.entries(previous))
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
  }
});
test("lead API validates origin and data, and preserves database success/failure states", async () => {
  const previous = {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    fetch: globalThis.fetch,
  };
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "server-only-test-key";
  let responseBody = true,
    httpStatus = 200,
    calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.match(String(url), /\/rest\/v1\/rpc\/submit_lead$/);
    const payload = JSON.parse(init.body);
    assert.match(payload.p_request_hash, /^[a-f0-9]{64}$/);
    assert.equal(payload.p_phone, "0900000000");
    return new Response(JSON.stringify(responseBody), {
      status: httpStatus,
      headers: { "Content-Type": "application/json" },
    });
  };
  const valid = {
    method: "POST",
    headers: {
      host: "example.test",
      origin: "https://example.test",
      "content-type": "application/json",
      "x-real-ip": "192.0.2.1",
    },
    body: {
      name: "Khách thử nghiệm",
      phone: "0900000000",
      need: "Cần thuê căn hộ tại Hà Nội",
      consent: true,
    },
  };
  try {
    let res = response();
    await handler({ ...valid, method: "GET" }, res);
    assert.equal(res.code, 405);
    res = response();
    await handler(
      {
        ...valid,
        headers: { ...valid.headers, origin: "https://another.test" },
      },
      res,
    );
    assert.equal(res.code, 403);
    res = response();
    await handler({ ...valid, body: { ...valid.body, consent: false } }, res);
    assert.equal(res.code, 400);
    assert.equal(calls, 0);
    res = response();
    await handler(valid, res);
    assert.equal(res.code, 201);
    assert.equal(res.body.ok, true);
    responseBody = false;
    res = response();
    await handler(valid, res);
    assert.equal(res.code, 429);
    assert.equal(res.headers["Retry-After"], "3600");
    responseBody = { message: "internal database error details" };
    httpStatus = 500;
    res = response();
    await handler(valid, res);
    assert.equal(res.code, 502);
    assert.ok(!JSON.stringify(res.body).includes("internal database error"));
  } finally {
    globalThis.fetch = previous.fetch;
    if (previous.url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previous.url;
    if (previous.key === undefined)
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.key;
  }
});
