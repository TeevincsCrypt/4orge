import { describe, expect, it } from "vitest";
import { parseConstructorArgs } from "@/lib/abi-args";
import type { AbiItem } from "@/lib/types";

const ctor = (...types: string[]): AbiItem[] => [{ type: "constructor", inputs: types.map((t, i) => ({ type: t, name: `a${i}` })) }];

describe("constructor argument parsing", () => {
  it("parses common types", () => {
    const r = parseConstructorArgs(ctor("uint256", "address", "bool", "string", "bytes32", "uint8[]"), [
      "1e18",
      "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
      "true",
      "hello",
      "0x" + "ab".repeat(32),
      "[1,2,3]",
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.values[0]).toBe(10n ** 18n);
      expect(r.values[1]).toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
      expect(r.values[2]).toBe(true);
      expect(r.values[5]).toEqual([1n, 2n, 3n]);
    }
  });
  it("rejects out-of-range integers", () => {
    expect(parseConstructorArgs(ctor("uint8"), ["256"]).ok).toBe(false);
    expect(parseConstructorArgs(ctor("uint256"), ["-1"]).ok).toBe(false);
    expect(parseConstructorArgs(ctor("int8"), ["-128"]).ok).toBe(true);
  });
  it("rejects bad addresses and checksums", () => {
    expect(parseConstructorArgs(ctor("address"), ["0x123"]).ok).toBe(false);
    expect(parseConstructorArgs(ctor("address"), ["0xF39fd6e51aad88f6f4ce6ab8827279cfffb92266"]).ok).toBe(false);
  });
  it("checks argument count and fixed sizes", () => {
    expect(parseConstructorArgs(ctor("uint256"), []).ok).toBe(false);
    expect(parseConstructorArgs(ctor("bytes4"), ["0x1234"]).ok).toBe(false);
    expect(parseConstructorArgs(ctor("uint256[2]"), [["1"]]).ok).toBe(false);
  });
  it("handles constructors without inputs", () => {
    expect(parseConstructorArgs([], []).ok).toBe(true);
  });
});
