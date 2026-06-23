const test = require("node:test");
const assert = require("node:assert");
const { buildVisionRequest } = require("../lib/openai.js");

test("buildVisionRequest: URL·헤더·모델", () => {
  const req = buildVisionRequest(["data:image/jpeg;base64,AAA"], "sk-test");
  assert.equal(req.url, "https://api.openai.com/v1/chat/completions");
  assert.equal(req.headers.Authorization, "Bearer sk-test");
  assert.equal(req.headers["Content-Type"], "application/json");
  const body = JSON.parse(req.body);
  assert.equal(body.model, "gpt-4o");
});

test("buildVisionRequest: 텍스트 1개 + 이미지 N개 content", () => {
  const req = buildVisionRequest(["data:image/jpeg;base64,A", "data:image/jpeg;base64,B"], "sk-test");
  const content = JSON.parse(req.body).messages[0].content;
  assert.equal(content.length, 3); // text + 2 images
  assert.equal(content[0].type, "text");
  assert.equal(content[1].type, "image_url");
  assert.equal(content[1].image_url.url, "data:image/jpeg;base64,A");
});
