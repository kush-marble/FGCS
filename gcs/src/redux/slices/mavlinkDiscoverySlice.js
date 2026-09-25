import { createSlice } from "@reduxjs/toolkit"
import { getDiscoveryCatalog } from "../../helpers/mavlinkDiscovery"

const mavlinkDiscoverySlice = createSlice({
  name: "mavlinkDiscovery",
  initialState: {
    catalog: getDiscoveryCatalog(),
  },
  reducers: {
    discoveryCatalogUpdated: (state) => {
      state.catalog = getDiscoveryCatalog()
    },
  },
  selectors: {
    selectDiscoveryCatalog: (state) => state.catalog,
  },
})

export const { discoveryCatalogUpdated } = mavlinkDiscoverySlice.actions

export const { selectDiscoveryCatalog } = mavlinkDiscoverySlice.selectors

export default mavlinkDiscoverySlice
