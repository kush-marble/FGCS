import { beforeEach, describe, expect, it } from "vitest"
import {
  __resetDiscoveryForTests,
  cleanNamedValueName,
  getDiscoveryCatalog,
  isDiscoverableField,
  recordMessage,
  resolveSelectedValue,
} from "./mavlinkDiscovery"

beforeEach(() => {
  __resetDiscoveryForTests()
})

describe("recordMessage", () => {
  it("reports novelty only the first time a message is seen", () => {
    const msg = { mavpackettype: "MADE_UP_MSG", alpha: 1 }
    expect(recordMessage(msg)).toBe(true)
    expect(recordMessage(msg)).toBe(false)
  })

  it("reports novelty again when a new field appears", () => {
    expect(recordMessage({ mavpackettype: "MADE_UP_MSG", alpha: 1 })).toBe(true)
    expect(
      recordMessage({ mavpackettype: "MADE_UP_MSG", alpha: 1, beta: 2 }),
    ).toBe(true)
    expect(
      recordMessage({ mavpackettype: "MADE_UP_MSG", alpha: 1, beta: 2 }),
    ).toBe(false)
  })

  it("adds discovered fields to the catalogue", () => {
    recordMessage({ mavpackettype: "MADE_UP_MSG", alpha: 1, beta: 2 })
    expect(getDiscoveryCatalog().MADE_UP_MSG).toEqual(["alpha", "beta"])
  })

  it("ignores a message with no packet type", () => {
    expect(recordMessage({})).toBe(false)
    expect(recordMessage(null)).toBe(false)
    expect(recordMessage({ mavpackettype: "" })).toBe(false)
  })

  it("sorts the fields of a message", () => {
    recordMessage({ mavpackettype: "MADE_UP_MSG", zeta: 1, alpha: 2, mid: 3 })
    expect(getDiscoveryCatalog().MADE_UP_MSG).toEqual(["alpha", "mid", "zeta"])
  })

  it("knows nothing about a message it has never received", () => {
    expect(getDiscoveryCatalog().ATTITUDE).toBeUndefined()
  })

  it("keeps entries after messages from other aircraft arrive", () => {
    recordMessage({ mavpackettype: "FROM_FIRST_DRONE", alpha: 1 })
    for (let i = 0; i < 50; i++) {
      recordMessage({ mavpackettype: `OTHER_MSG_${i}`, value: i })
    }
    expect(getDiscoveryCatalog().FROM_FIRST_DRONE).toEqual(["alpha"])
  })
})

describe("fields sharing a name across messages", () => {
  // e.g. AHRS.alt and VFR_HUD.alt: entries are per message, so neither the
  // catalogue nor the value matcher may let one stand in for the other
  const ahrs = { mavpackettype: "AHRS", alt: 111, roll: 1 }
  const vfrHud = { mavpackettype: "VFR_HUD", alt: 222, climb: 2 }

  it("keeps a separate entry per message", () => {
    recordMessage(ahrs)
    recordMessage(vfrHud)
    expect(getDiscoveryCatalog()).toEqual({
      AHRS: ["alt", "roll"],
      VFR_HUD: ["alt", "climb"],
    })
  })

  it("does not let one message feed the other's box", () => {
    expect(resolveSelectedValue(ahrs, "AHRS.alt")).toBe(111)
    expect(resolveSelectedValue(ahrs, "VFR_HUD.alt")).toBeUndefined()
    expect(resolveSelectedValue(vfrHud, "VFR_HUD.alt")).toBe(222)
    expect(resolveSelectedValue(vfrHud, "AHRS.alt")).toBeUndefined()
  })
})

describe("isDiscoverableField", () => {
  it("accepts finite numbers", () => {
    expect(isDiscoverableField("alt", 12.5)).toBe(true)
    expect(isDiscoverableField("alt", 0)).toBe(true)
    expect(isDiscoverableField("alt", -3)).toBe(true)
  })

  it.each([
    ["a string", "hello"],
    ["an array", [1, 2, 3]],
    ["null", null],
    ["undefined", undefined],
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["a boolean", true],
    ["an object", {}],
  ])("rejects %s", (_label, value) => {
    expect(isDiscoverableField("field", value)).toBe(false)
  })

  it("rejects the transport fields", () => {
    expect(isDiscoverableField("mavpackettype", 1)).toBe(false)
    expect(isDiscoverableField("timestamp", 1700000000)).toBe(false)
  })
})

describe("field exclusions in practice", () => {
  it("leaves out strings, arrays and transport fields", () => {
    recordMessage({
      mavpackettype: "STATUSTEXT",
      timestamp: 1700000000,
      severity: 6,
      text: "hello there",
      chunk_seq: 0,
    })
    expect(getDiscoveryCatalog().STATUSTEXT).toEqual(["chunk_seq", "severity"])
  })

  it("leaves out ESC telemetry arrays", () => {
    recordMessage({
      mavpackettype: "ESC_TELEMETRY_1_TO_4",
      voltage: [1, 2, 3, 4],
      rpm: [10, 20, 30, 40],
      counter: 7,
    })
    expect(getDiscoveryCatalog().ESC_TELEMETRY_1_TO_4).toEqual(["counter"])
  })

  it("keeps time_boot_ms, which is a legitimate numeric field", () => {
    recordMessage({ mavpackettype: "MADE_UP_MSG", time_boot_ms: 1234 })
    expect(getDiscoveryCatalog().MADE_UP_MSG).toContain("time_boot_ms")
  })
})

describe("named value messages", () => {
  const namedValue = (name, value) => ({
    mavpackettype: "NAMED_VALUE_FLOAT",
    time_boot_ms: 1000,
    name,
    value,
  })

  it("keys entries by the value's name rather than the field", () => {
    recordMessage(namedValue("AAA", 1))
    recordMessage(namedValue("BBB", 2))
    expect(getDiscoveryCatalog().NAMED_VALUE_FLOAT).toEqual(["AAA", "BBB"])
  })

  it("does not offer the message's own fields as values", () => {
    recordMessage(namedValue("AAA", 1))
    const entry = getDiscoveryCatalog().NAMED_VALUE_FLOAT
    expect(entry).not.toContain("value")
    expect(entry).not.toContain("time_boot_ms")
    expect(entry).not.toContain("name")
  })

  it("strips the NUL padding pymavlink leaves on the name", () => {
    recordMessage(namedValue("AAA\u0000\u0000", 1))
    expect(getDiscoveryCatalog().NAMED_VALUE_FLOAT).toEqual(["AAA"])
  })

  it("ignores a nameless or non numeric named value", () => {
    expect(recordMessage(namedValue("", 1))).toBe(false)
    expect(recordMessage(namedValue("   ", 1))).toBe(false)
    expect(recordMessage(namedValue("AAA", "not a number"))).toBe(false)
  })

  it("handles NAMED_VALUE_INT the same way", () => {
    recordMessage({
      mavpackettype: "NAMED_VALUE_INT",
      name: "COUNT",
      value: 3,
      time_boot_ms: 1,
    })
    expect(getDiscoveryCatalog().NAMED_VALUE_INT).toEqual(["COUNT"])
  })
})

describe("cleanNamedValueName", () => {
  it("removes NULs and surrounding whitespace", () => {
    expect(cleanNamedValueName("AAA\u0000\u0000")).toBe("AAA")
    expect(cleanNamedValueName("  BBB  ")).toBe("BBB")
  })

  it("handles missing input", () => {
    expect(cleanNamedValueName(null)).toBe("")
    expect(cleanNamedValueName(undefined)).toBe("")
  })
})

describe("resolveSelectedValue", () => {
  it("reads the field off a matching message", () => {
    const msg = { mavpackettype: "VFR_HUD", alt: 123.4 }
    expect(resolveSelectedValue(msg, "VFR_HUD.alt")).toBe(123.4)
  })

  it("returns undefined when the message does not carry the field", () => {
    const msg = { mavpackettype: "VFR_HUD", alt: 123.4 }
    expect(resolveSelectedValue(msg, "VFR_HUD.climb")).toBeUndefined()
  })

  it("does not let ATTITUDE hijack ATTITUDE_QUATERNION", () => {
    const msg = { mavpackettype: "ATTITUDE", rollspeed: 0.5 }
    expect(
      resolveSelectedValue(msg, "ATTITUDE_QUATERNION.rollspeed"),
    ).toBeUndefined()
    expect(resolveSelectedValue(msg, "ATTITUDE.rollspeed")).toBe(0.5)
  })

  it("does not let RC_CHANNELS hijack RC_CHANNELS_RAW", () => {
    const msg = { mavpackettype: "RC_CHANNELS", chan1_raw: 1500 }
    expect(
      resolveSelectedValue(msg, "RC_CHANNELS_RAW.chan1_raw"),
    ).toBeUndefined()
  })

  it("does not let SCALED_PRESSURE hijack SCALED_PRESSURE2", () => {
    const msg = { mavpackettype: "SCALED_PRESSURE", press_abs: 1013 }
    expect(
      resolveSelectedValue(msg, "SCALED_PRESSURE2.press_abs"),
    ).toBeUndefined()
  })

  it("returns undefined for malformed selections", () => {
    const msg = { mavpackettype: "VFR_HUD", alt: 1 }
    expect(resolveSelectedValue(msg, "")).toBeUndefined()
    expect(resolveSelectedValue(msg, "VFR_HUD")).toBeUndefined()
    expect(resolveSelectedValue(msg, ".alt")).toBeUndefined()
    expect(resolveSelectedValue(msg, "VFR_HUD.")).toBeUndefined()
    expect(resolveSelectedValue(msg, null)).toBeUndefined()
    expect(resolveSelectedValue(msg, undefined)).toBeUndefined()
    expect(resolveSelectedValue(null, "VFR_HUD.alt")).toBeUndefined()
  })

  it("does not pick up inherited object properties", () => {
    const msg = { mavpackettype: "VFR_HUD" }
    expect(resolveSelectedValue(msg, "VFR_HUD.toString")).toBeUndefined()
  })

  it("matches a named value by its name", () => {
    const msg = {
      mavpackettype: "NAMED_VALUE_FLOAT",
      name: "TESTVAL",
      value: 42,
      time_boot_ms: 1,
    }
    expect(resolveSelectedValue(msg, "NAMED_VALUE_FLOAT.TESTVAL")).toBe(42)
    expect(resolveSelectedValue(msg, "NAMED_VALUE_FLOAT.OTHER")).toBeUndefined()
  })

  it("matches a NUL padded named value", () => {
    const msg = {
      mavpackettype: "NAMED_VALUE_FLOAT",
      name: "TESTVAL\u0000\u0000",
      value: 42,
    }
    expect(resolveSelectedValue(msg, "NAMED_VALUE_FLOAT.TESTVAL")).toBe(42)
  })
})

describe("getDiscoveryCatalog", () => {
  it("is empty before anything is received", () => {
    expect(getDiscoveryCatalog()).toEqual({})
  })

  it("returns the same object until something new is recorded", () => {
    const first = getDiscoveryCatalog()
    expect(getDiscoveryCatalog()).toBe(first)

    recordMessage({ mavpackettype: "MADE_UP_MSG", alpha: 1 })
    expect(getDiscoveryCatalog()).not.toBe(first)
  })

  it("does not change identity for a repeat of a known message", () => {
    recordMessage({ mavpackettype: "MADE_UP_MSG", alpha: 1 })
    const first = getDiscoveryCatalog()
    recordMessage({ mavpackettype: "MADE_UP_MSG", alpha: 2 })
    expect(getDiscoveryCatalog()).toBe(first)
  })
})
