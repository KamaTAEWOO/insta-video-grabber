const test = require("node:test");
const assert = require("node:assert");
const { pickFrameTimes } = require("../lib/media.js");

test("pickFrameTimes: duration을 max개로 균등 분할", () => {
  assert.deepEqual(pickFrameTimes(10, 5), [1, 3, 5, 7, 9]);
});

test("pickFrameTimes: 짧은 영상은 ceil(duration)개로 제한", () => {
  assert.deepEqual(pickFrameTimes(2, 8), [0.5, 1.5]);
});

test("pickFrameTimes: duration이 0 이하면 빈 배열", () => {
  assert.deepEqual(pickFrameTimes(0, 8), []);
  assert.deepEqual(pickFrameTimes(-1, 8), []);
});

test("pickFrameTimes: 긴 영상은 max개로 제한", () => {
  assert.equal(pickFrameTimes(100, 8).length, 8);
});

test("pickFrameTimes: Infinity duration이면 빈 배열", () => {
  assert.deepEqual(pickFrameTimes(Infinity, 8), []);
});

test("pickFrameTimes: NaN duration이면 빈 배열", () => {
  assert.deepEqual(pickFrameTimes(NaN, 8), []);
});
