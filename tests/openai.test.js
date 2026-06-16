const test = require("node:test");
const assert = require("node:assert");
const { buildWhisperRequest } = require("../lib/openai.js");

test("buildWhisperRequest: URL과 Authorization 헤더", () => {
  const blob = new Blob(["x"], { type: "video/mp4" });
  const req = buildWhisperRequest(blob, "sk-test");
  assert.equal(req.url, "https://api.openai.com/v1/audio/transcriptions");
  assert.equal(req.headers.Authorization, "Bearer sk-test");
});

test("buildWhisperRequest: FormData에 model과 file 포함", () => {
  const blob = new Blob(["x"], { type: "video/mp4" });
  const req = buildWhisperRequest(blob, "sk-test");
  assert.ok(req.body instanceof FormData);
  assert.equal(req.body.get("model"), "whisper-1");
  assert.ok(req.body.get("file"));
});
