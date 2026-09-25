import { Checkbox, Grid, Modal, TextInput } from "@mantine/core"
import { IconSearch } from "@tabler/icons-react"
import { useEffect, useMemo, useState } from "react"
import { useSelector } from "react-redux"
import { selectDiscoveryCatalog } from "../redux/slices/mavlinkDiscoverySlice.js"

export default function DashboardDataModal({
  opened,
  close,
  selectedBox,
  handleCheckboxChange,
}) {
  const catalog = useSelector(selectDiscoveryCatalog)
  const [query, setQuery] = useState("")

  // Reset the search each time the modal opens
  useEffect(() => {
    if (opened) setQuery("")
  }, [opened])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()

    return Object.keys(catalog)
      .sort()
      .flatMap((msg) => {
        if (msg.toLowerCase().includes(q))
          return [{ msg, fields: catalog[msg] }]
        const fields = catalog[msg].filter((field) =>
          field.toLowerCase().includes(q),
        )
        return fields.length === 0 ? [] : [{ msg, fields }]
      })
  }, [catalog, query])

  return (
    <Modal
      opened={opened}
      onClose={() => {
        close()
      }}
      size={"100%"}
      title="Select Data"
      centered
      overlayProps={{
        backgroundOpacity: 0.55,
        blur: 3,
      }}
    >
      {selectedBox?.currently_selected && (
        <p className="mb-2 text-sm text-gray-400">
          Currently showing{" "}
          <span className="font-mono text-white">
            {selectedBox.currently_selected}
          </span>
        </p>
      )}

      <TextInput
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        placeholder="Search messages and fields"
        leftSection={<IconSearch size={16} />}
        data-autofocus
        className="mb-4"
      />

      {matches.length === 0 ? (
        <p className="text-sm text-gray-500">
          {Object.keys(catalog).length === 0
            ? "Nothing has been received from the aircraft yet"
            : "No messages or fields match that search"}
        </p>
      ) : (
        <Grid>
          {matches.map(({ msg, fields }) => (
            <Grid.Col span={12} key={msg}>
              <h3 className="mb-2">{msg}</h3>
              <Grid>
                {fields.map((field) => (
                  <Grid.Col span={2} key={field}>
                    <Checkbox
                      label={field}
                      id={`checkbox-${msg}-${field}`}
                      checked={
                        selectedBox?.currently_selected === `${msg}.${field}` ||
                        false
                      }
                      onChange={(e) =>
                        handleCheckboxChange(
                          msg,
                          field,
                          field,
                          selectedBox?.boxId,
                          e.target.checked,
                        )
                      }
                    />
                  </Grid.Col>
                ))}
              </Grid>
            </Grid.Col>
          ))}
        </Grid>
      )}
    </Modal>
  )
}
