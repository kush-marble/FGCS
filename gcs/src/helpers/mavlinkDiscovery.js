// Registry of messages and fields seen from incoming telemetry

const NAMED_VALUE_MESSAGES = new Set(["NAMED_VALUE_FLOAT", "NAMED_VALUE_INT"])

const EXCLUDED_FIELDS = new Set(["mavpackettype", "timestamp"])

const registry = new Map()
// Rebuilt lazily, cleared whenever something new is recorded
let cachedCatalog = null

function entryFor(messageName) {
  let entry = registry.get(messageName)
  if (entry === undefined) {
    entry = { fields: new Set() }
    registry.set(messageName, entry)
  }
  return entry
}

export function splitSelection(selection) {
  if (typeof selection !== "string") return null
  const dot = selection.indexOf(".")
  if (dot <= 0 || dot === selection.length - 1) return null
  return [selection.slice(0, dot), selection.slice(dot + 1)]
}

export function cleanNamedValueName(name) {
  return String(name ?? "")
    .replace(/\0/g, "")
    .trim()
}

export function isDiscoverableField(key, value) {
  if (EXCLUDED_FIELDS.has(key)) return false
  return typeof value === "number" && Number.isFinite(value)
}

// Record a message and it's fields
export function recordMessage(msg) {
  const messageName = msg?.mavpackettype
  if (typeof messageName !== "string" || messageName === "") return false

  const entry = entryFor(messageName)
  let changed = false

  if (NAMED_VALUE_MESSAGES.has(messageName)) {
    const name = cleanNamedValueName(msg.name)
    if (name === "" || !isDiscoverableField(name, msg.value)) return false
    if (!entry.fields.has(name)) {
      entry.fields.add(name)
      changed = true
    }
  } else {
    for (const key in msg) {
      if (entry.fields.has(key)) continue
      if (!isDiscoverableField(key, msg[key])) continue
      entry.fields.add(key)
      changed = true
    }
  }

  if (changed) cachedCatalog = null
  return changed
}

export function getDiscoveryCatalog() {
  if (cachedCatalog !== null) return cachedCatalog

  const catalog = {}
  registry.forEach((entry, messageName) => {
    catalog[messageName] = [...entry.fields].sort()
  })

  cachedCatalog = catalog
  return catalog
}

export function resolveSelectedValue(msg, currentlySelected) {
  if (
    typeof currentlySelected !== "string" ||
    msg === null ||
    msg === undefined
  ) {
    return undefined
  }

  const dot = currentlySelected.indexOf(".")
  if (dot <= 0 || dot === currentlySelected.length - 1) return undefined

  const messageName = currentlySelected.slice(0, dot)
  if (messageName !== msg.mavpackettype) return undefined

  const key = currentlySelected.slice(dot + 1)

  if (NAMED_VALUE_MESSAGES.has(messageName)) {
    return cleanNamedValueName(msg.name) === key ? msg.value : undefined
  }

  return Object.prototype.hasOwnProperty.call(msg, key) ? msg[key] : undefined
}

export function __resetDiscoveryForTests() {
  registry.clear()
  cachedCatalog = null
}
