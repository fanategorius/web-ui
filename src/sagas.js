import Api from 'ovirtapi'
import { persistStateToLocalStorage } from './storage'
import Selectors from './selectors'
import AppConfiguration from './config'

import vmEditSagas from './components/VmDialog/sagas'
import vmDisksSagas from './components/VmDisks/sagas'
import newDiskDialogSagas from './components/NewDiskDialog/sagas'
import vmSnapshotsSagas from './components/VmSnapshots/sagas'

import {
  all,
  call,
  put,
  race,
  take,
  takeEvery,
  takeLatest,
  throttle,
} from 'redux-saga/effects'

import { logDebug } from './helpers'

import { push } from 'connected-react-router'
import {
  setChanged,
  updateIcons,
  setVmDisks,
  updateVms,
  removeVms,
  vmActionInProgress,
  setVmConsoles,
  removeMissingVms,
  setVmSessions,
  persistState,

  getSingleVm,
  setClusters,
  setHosts,
  setTemplates,
  setOperatingSystems,
  setStorageDomains,
  setDataCenters,
  addNetworksToVnicProfiles,
  setVnicProfiles,
  setVmSnapshots,

  getSinglePool,
  removeMissingPools,
  removePools,
  updatePools,
  updateVmsPoolsCount,
  poolActionInProgress,

  refresh,
  getVmsByCount,
  getPoolsByCount,
  addStorageDomains,
  setStorageDomainsFiles,
  setVmCDRom,
  setVmNics,
  setUSBFilter,
  removeActiveRequest,
  stopSchedulerFixedDelay,
} from './actions'

import {
  callExternalAction,
  delay,
  foreach,
} from './saga/utils'

import {
  doCheckTokenExpired,
  login,
  logout,
  compareVersion,
} from './saga/login'

import {
  downloadVmConsole,
  getConsoleOptions,
  saveConsoleOptions,
  getRDPVm,
  fetchConsoleVmMeta,
  getConsoleInUse,
} from './saga/console'

import {
  ADD_VM_NIC,
  CHECK_CONSOLE_IN_USE,
  CHECK_TOKEN_EXPIRED,
  DELAYED_REMOVE_ACTIVE_REQUEST,
  DELETE_VM_NIC,
  DOWNLOAD_CONSOLE_VM,
  GET_ALL_CLUSTERS,
  GET_ALL_HOSTS,
  GET_ALL_OS,
  GET_ALL_STORAGE_DOMAINS,
  GET_ALL_TEMPLATES,
  GET_ALL_VNIC_PROFILES,
  GET_BY_PAGE,
  GET_CONSOLE_OPTIONS,
  GET_ISO_STORAGE_DOMAINS,
  GET_POOLS_BY_COUNT,
  GET_POOLS_BY_PAGE,
  GET_RDP_VM,
  GET_USB_FILTER,
  GET_VMS_BY_COUNT,
  GET_VMS_BY_PAGE,
  LOGIN,
  LOGOUT,
  PERSIST_STATE,
  REFRESH_DATA,
  REMOVE_VM,
  RESTART_VM,
  SAVE_CONSOLE_OPTIONS,
  SELECT_POOL_DETAIL,
  SELECT_VM_DETAIL,
  SHUTDOWN_VM,
  START_POOL,
  START_SCHEDULER_FIXED_DELAY,
  START_VM,
  STOP_SCHEDULER_FIXED_DELAY,
  SUSPEND_VM,
} from './constants'

/**
 * Compare the current oVirt version (held in redux) to the given version.
 */
function compareVersionToCurrent ({ major, minor }) {
  const current = Selectors.getOvirtVersion().toJS()
  return compareVersion(current, { major, minor })
}

function* fetchByPage (action) {
  yield put(setChanged({ value: false }))
  yield fetchVmsByPage(action)
  yield fetchPoolsByPage(action)
}

function* persistStateSaga () {
  yield persistStateToLocalStorage({ icons: Selectors.getAllIcons().toJS() })
}

function* fetchUnknownIconsForVms ({ vms, os }) {
  // unique iconIds from all VMs or OS (if available)
  const iconsIds = new Set()
  if (vms) {
    vms.map(vm => vm.icons.large.id).forEach(id => iconsIds.add(id))
  }

  if (os) {
    os.map(os => os.icons.large.id).forEach(id => iconsIds.add(id))
  }

  // reduce to just unknown
  const allKnownIcons = Selectors.getAllIcons()
  const notLoadedIconIds = [...iconsIds].filter(id => !allKnownIcons.get(id))

  yield * foreach(notLoadedIconIds, function* (iconId) {
    yield fetchIcon({ iconId })
  })
}

function* fetchIcon ({ iconId }) {
  if (iconId) {
    const icon = yield callExternalAction('icon', Api.icon, { type: 'GET_ICON', payload: { id: iconId } })
    if (icon['media_type'] && icon['data']) {
      yield put(updateIcons({ icons: [Api.iconToInternal({ icon })] }))
    }
  }
}

function* refreshData (action) {
  logDebug('refreshData(): ', action.payload)
  const shallowFetch = !!action.payload.shallowFetch

  // refresh VMs and remove any that haven't been refreshed
  const fetchedVmIds = yield fetchVmsByCount(getVmsByCount({
    count: action.payload.page * AppConfiguration.pageLimit,
    shallowFetch,
  }))

  const fetchedDirectlyVmIds =
    (yield all(
      Selectors
        .getVmIds()
        .filter(vmId => !fetchedVmIds.includes(vmId))
        .map(vmId => call(fetchSingleVm, getSingleVm({ vmId, shallowFetch })))
    ))
      .reduce((vmIds, vm) => { if (vm) vmIds.push(vm.id); return vmIds }, [])

  yield put(removeMissingVms({ vmIdsToPreserve: [ ...fetchedVmIds, ...fetchedDirectlyVmIds ] }))

  // refresh Pools and remove any that haven't been refreshed
  const fetchedPoolIds = yield fetchPoolsByCount(getPoolsByCount({
    count: action.payload.page * AppConfiguration.pageLimit,
  }))

  const fetchedDirectlyPoolIds =
    (yield all(
      Selectors
        .getPoolIds()
        .filter(poolId => !fetchedPoolIds.includes(poolId))
        .map(poolId => call(fetchSinglePool, getSinglePool({ poolId })))
    ))
      .reduce((poolIds, pool) => { if (pool) poolIds.push(pool.id); return poolIds }, [])

  yield put(removeMissingPools({ poolIdsToPreserve: [ ...fetchedPoolIds, ...fetchedDirectlyPoolIds ] }))

  // update counts
  yield put(updateVmsPoolsCount())
  logDebug('refreshData(): finished')
}

function* fetchVmsByPage (action) {
  if (compareVersionToCurrent({ major: 4, minor: 2 })) {
    yield fetchVmsByPageV42(action)
  } else {
    yield fetchVmsByPageVLower(action)
  }
}

/**
 * Fetch VMs with additional nested data requested (on ovirt 4.2 and later)
 */
function* fetchVmsByPageV42 (action) {
  const { shallowFetch, page } = action.payload

  action.payload.additional = shallowFetch
    ? []
    : ['cdroms', 'sessions', 'disk_attachments.disk', 'graphics_consoles', 'nics']

  // TODO: paging: split this call to a loop per up to 25 VMs
  const allVms = yield callExternalAction('getVmsByPage', Api.getVmsByPage, action)
  if (allVms && allVms['vm']) { // array
    const internalVms = allVms.vm.map(vm => Api.vmToInternal({ vm, getSubResources: true }))

    yield put(updateVms({ vms: internalVms, copySubResources: true, page: page }))
    yield fetchUnknownIconsForVms({ vms: internalVms })
  }

  yield put(persistState())
}

/**
 * Fetch VMs and individually fetch nested data as requested (on ovirt 4.1 and earlier)
 */
function* fetchVmsByPageVLower (action) {
  const { shallowFetch, page } = action.payload

  // TODO: paging: split this call to a loop per up to 25 vms
  const allVms = yield callExternalAction('getVmsByPage', Api.getVmsByPage, action)
  if (allVms && allVms['vm']) { // array
    const internalVms = allVms.vm.map(vm => Api.vmToInternal({ vm }))

    yield put(updateVms({ vms: internalVms, copySubResources: true, page: page }))
    yield fetchUnknownIconsForVms({ vms: internalVms })

    if (!shallowFetch) {
      yield fetchConsoleMetadatas({ vms: internalVms })
      yield fetchDisks({ vms: internalVms })
      yield fetchVmsSessions({ vms: internalVms })
      yield fetchVmsCDRom({ vms: internalVms })
      yield fetchVmsNics({ vms: internalVms })
      yield fetchVmsSnapshots({ vms: internalVms })
    } else {
      logDebug('getVmsByPage() shallow fetch requested - skipping other resources')
    }
  }

  yield put(persistState())
}

/**
 * Fetch a given number of VMs (**action.payload.count**).
 */
function* fetchVmsByCount (action) {
  if (compareVersionToCurrent({ major: 4, minor: 2 })) {
    return yield fetchVmsByCountV42(action)
  } else {
    return yield fetchVmsByCountVLower(action)
  }
}

function* fetchVmsByCountV42 (action) {
  const { shallowFetch } = action.payload
  const fetchedVmIds = []

  action.payload.additional = shallowFetch
    ? []
    : ['cdroms', 'sessions', 'disk_attachments.disk', 'graphics_consoles', 'nics']

  const allVms = yield callExternalAction('getVmsByCount', Api.getVmsByCount, action)
  if (allVms && allVms['vm']) { // array
    const internalVms = allVms.vm.map(vm => Api.vmToInternal({ vm, getSubResources: true }))
    internalVms.forEach(vm => fetchedVmIds.push(vm.id))

    yield put(updateVms({ vms: internalVms, copySubResources: true }))
    yield fetchUnknownIconsForVms({ vms: internalVms })
  }

  yield put(persistState())
  return fetchedVmIds
}

function* fetchVmsByCountVLower (action) {
  const { shallowFetch } = action.payload
  const fetchedVmIds = []

  // TODO: paging: split this call to a loop per up to 25 vms
  const allVms = yield callExternalAction('getVmsByCount', Api.getVmsByCount, action)
  if (allVms && allVms['vm']) { // array
    const internalVms = allVms.vm.map(vm => Api.vmToInternal({ vm }))
    internalVms.forEach(vm => fetchedVmIds.push(vm.id))

    yield put(updateVms({ vms: internalVms, copySubResources: true }))
    yield fetchUnknownIconsForVms({ vms: internalVms })

    if (!shallowFetch) {
      yield fetchConsoleMetadatas({ vms: internalVms })
      yield fetchDisks({ vms: internalVms })
      yield fetchVmsSessions({ vms: internalVms })
      yield fetchVmsCDRom({ vms: internalVms })
      yield fetchVmsNics({ vms: internalVms })
      yield fetchVmsSnapshots({ vms: internalVms })
    } else {
      logDebug('fetchVmsByCountVLower() shallow fetch requested - skipping other resources')
    }
  }

  yield put(persistState())
  return fetchedVmIds
}

export function* fetchSingleVm (action) {
  const { vmId, shallowFetch } = action.payload

  const isOvirtGTE42 = compareVersionToCurrent({ major: 4, minor: 2 })
  if (isOvirtGTE42 && !shallowFetch) {
    action.payload.additional =
      ['cdroms', 'sessions', 'disk_attachments.disk', 'graphics_consoles', 'nics', 'snapshots']
  }

  const vm = yield callExternalAction('getVm', Api.getVm, action, true)
  let internalVm = null
  if (vm && vm.id) {
    internalVm = Api.vmToInternal({ vm, getSubResources: isOvirtGTE42 })

    if (!isOvirtGTE42 && !shallowFetch) {
      internalVm.disks = yield fetchVmDisks({ vmId: internalVm.id })
      internalVm.consoles = yield fetchConsoleVmMeta({ vmId: internalVm.id })
      internalVm.sessions = yield fetchVmSessions({ vmId: internalVm.id })
      internalVm.cdrom = yield fetchVmCDRom({ vmId: internalVm.id, running: internalVm.status === 'up' })
      internalVm.nics = yield fetchVmNics({ vmId: internalVm.id })
    }

    yield put(updateVms({ vms: [internalVm] }))
    yield fetchUnknownIconsForVms({ vms: [internalVm] })
  } else {
    if (vm && vm.error && vm.error.status === 404) {
      yield put(removeVms({ vmIds: [vmId] }))
    }
  }

  yield put(updateVmsPoolsCount())
  return internalVm
}

function* fetchPoolsByCount (action) {
  const fetchedPoolIds = []

  const allPools = yield callExternalAction('getPoolsByCount', Api.getPoolsByCount, action)
  if (allPools && allPools['vm_pool']) { // array
    const internalPools = allPools.vm_pool.map(pool => Api.poolToInternal({ pool }))
    internalPools.forEach(pool => fetchedPoolIds.push(pool.id))

    yield put(updatePools({ pools: internalPools }))
    yield put(updateVmsPoolsCount())
  }

  yield put(persistState())
  return fetchedPoolIds
}

function* fetchPoolsByPage (action) {
  const allPools = yield callExternalAction('getPoolsByPage', Api.getPoolsByPage, action)

  if (allPools && allPools['vm_pool']) { // array
    const internalPools = allPools.vm_pool.map(pool => Api.poolToInternal({ pool }))

    yield put(updatePools({ pools: internalPools }))
    yield put(updateVmsPoolsCount())
  }

  yield put(persistState())
}

function* fetchSinglePool (action) {
  const { poolId } = action.payload

  const pool = yield callExternalAction('getPool', Api.getPool, action, true)
  let internalPool = false
  if (pool && pool.id) {
    internalPool = Api.poolToInternal({ pool })
    yield put(updatePools({ pools: [internalPool] }))
  } else {
    if (pool && pool.error && pool.error.status === 404) {
      yield put(removePools({ poolIds: [poolId] }))
    }
  }

  yield put(updateVmsPoolsCount())
  return internalPool
}

function* fetchVmsSessions ({ vms }) {
  yield * foreach(vms, function* (vm) {
    const sessionsInternal = yield fetchVmSessions({ vmId: vm.id })
    yield put(setVmSessions({ vmId: vm.id, sessions: sessionsInternal }))
  })
}

function* fetchVmCDRom ({ vmId, running }) {
  const cdrom = yield callExternalAction('getCDRom', Api.getCDRom, { type: 'GET_VM_CDROM', payload: { vmId, running } })
  if (cdrom) {
    const cdromInternal = Api.CDRomToInternal({ cdrom })
    return cdromInternal
  }
  return null
}

function* fetchVmsCDRom ({ vms }) {
  yield * foreach(vms, function* (vm) {
    const cdromInternal = yield fetchVmCDRom({ vmId: vm.id, running: vm.status === 'up' })
    yield put(setVmCDRom({ vmId: vm.id, cdrom: cdromInternal }))
  })
}

function* fetchConsoleMetadatas ({ vms }) {
  yield * foreach(vms, function* (vm) {
    const consolesInternal = yield fetchConsoleVmMeta({ vmId: vm.id })
    yield put(setVmConsoles({ vmId: vm.id, consoles: consolesInternal }))
  })
}

export function* fetchDisks ({ vms }) {
  yield * foreach(vms, function* (vm) {
    const vmId = vm.id
    const disks = yield fetchVmDisks({ vmId })
    yield put(setVmDisks({ vmId, disks }))
  })
}

function* fetchVmDisks ({ vmId }) {
  // TODO: Enhance to use the `follow` API parameter (in API >=4.2) to reduce the request count
  //       This should follow the same style as `fetchSingleVm` and would require an extension to `Api.diskattachments`
  const diskattachments = yield callExternalAction('diskattachments', Api.diskattachments, { type: 'GET_DISK_ATTACHMENTS', payload: { vmId } })

  if (diskattachments && diskattachments['disk_attachment']) { // array
    const internalDisks = []
    yield * foreach(diskattachments['disk_attachment'], function* (attachment) {
      const diskId = attachment.disk.id
      const disk = yield callExternalAction('disk', Api.disk, { type: 'GET_DISK_DETAILS', payload: { diskId } })
      internalDisks.push(Api.diskToInternal({ disk, attachment }))
    })
    return internalDisks
  }
  return []
}

function* addVmNic (action) {
  const nic = yield callExternalAction('addNicToVm', Api.addNicToVm, action)

  if (nic && nic.id) {
    const nicsInternal = yield fetchVmNics({ vmId: action.payload.vmId })
    yield put(setVmNics({ vmId: action.payload.vmId, nics: nicsInternal }))
  }
}

function* deleteVmNic (action) {
  yield callExternalAction('deleteNicFromVm', Api.deleteNicFromVm, action)

  const nicsInternal = yield fetchVmNics({ vmId: action.payload.vmId })
  yield put(setVmNics({ vmId: action.payload.vmId, nics: nicsInternal }))
}

export function* startProgress ({ vmId, poolId, name }) {
  if (vmId) {
    yield put(vmActionInProgress({ vmId, name, started: true }))
  } else {
    yield put(poolActionInProgress({ poolId, name, started: true }))
  }
}

function* getSingleInstance ({ vmId, poolId }) {
  const fetches = [ fetchSingleVm(getSingleVm({ vmId })) ]
  if (poolId) {
    fetches.push(fetchSinglePool(getSinglePool({ poolId })))
  }
  yield all(fetches)
}

export function* stopProgress ({ vmId, poolId, name, result }) {
  const actionInProgress = vmId ? vmActionInProgress : poolActionInProgress
  if (result && result.status === 'complete') {
    // do not call "end of in progress" if successful,
    // since UI will be updated by refresh
    yield delay(5 * 1000)
    yield getSingleInstance({ vmId, poolId })

    yield delay(30 * 1000)
    yield getSingleInstance({ vmId, poolId })
  }

  yield put(actionInProgress(Object.assign(vmId ? { vmId } : { poolId }, { name, started: false })))
}

function* shutdownVm (action) {
  yield startProgress({ vmId: action.payload.vmId, name: 'shutdown' })
  const result = yield callExternalAction('shutdown', Api.shutdown, action)
  yield stopProgress({ vmId: action.payload.vmId, name: 'shutdown', result })
}

function* restartVm (action) {
  yield startProgress({ vmId: action.payload.vmId, name: 'restart' })
  const result = yield callExternalAction('restart', Api.restart, action)
  yield stopProgress({ vmId: action.payload.vmId, name: 'restart', result })
}

function* suspendVm (action) {
  yield startProgress({ vmId: action.payload.vmId, name: 'suspend' })
  const result = yield callExternalAction('suspend', Api.suspend, action)
  yield stopProgress({ vmId: action.payload.vmId, name: 'suspend', result })
}

function* startVm (action) {
  yield startProgress({ vmId: action.payload.vmId, name: 'start' })
  const result = yield callExternalAction('start', Api.start, action)
  // TODO: check status at refresh --> conditional refresh wait_for_launch
  yield stopProgress({ vmId: action.payload.vmId, name: 'start', result })
}

function* startPool (action) {
  yield startProgress({ poolId: action.payload.poolId, name: 'start' })
  const result = yield callExternalAction('startPool', Api.startPool, action)
  yield stopProgress({ poolId: action.payload.poolId, name: 'start', result })
}

function* removeVm (action) {
  yield startProgress({ vmId: action.payload.vmId, name: 'remove' })
  const result = yield callExternalAction('remove', Api.remove, action)

  if (result.status === 'complete') {
    yield put(push('/'))
  }

  yield stopProgress({ vmId: action.payload.vmId, name: 'remove', result })
}

export function* fetchVmSessions ({ vmId }) {
  const sessions = yield callExternalAction('sessions', Api.sessions, { payload: { vmId } })

  if (sessions && sessions['session']) {
    return Api.sessionsToInternal({ sessions })
  }
  return []
}

/**
 * VmDetail is to be rendered.
 */
export function* selectVmDetail (action) {
  yield fetchSingleVm(getSingleVm({ vmId: action.payload.vmId })) // async data refresh
}

function* selectPoolDetail (action) {
  yield fetchSinglePool(getSinglePool({ poolId: action.payload.poolId }))
}

function* fetchAllTemplates (action) {
  const templates = yield callExternalAction('getAllTemplates', Api.getAllTemplates, action)

  if (templates && templates['template']) {
    const templatesInternal = templates.template.map(template => Api.templateToInternal({ template }))
    yield put(setTemplates(templatesInternal))
  }
}

/**
 * Storage domain not attached to any data center won't be fetched.
 */
function* fetchAllAttachedStorageDomains (action) {
  Object.assign(action, { payload: { additional: [ 'storage_domains' ] } })
  const dataCentersApi = yield callExternalAction('getAllDataCenters', Api.getAllDataCenters, action)
  if (!dataCentersApi || !dataCentersApi.data_center) {
    return
  }

  // getting data centers is necessary to get storage domains with statuses
  // so why not to store them when we have them fresh
  const dataCentersInternal = dataCentersApi.data_center.map(dataCenter => Api.dataCenterToInternal({ dataCenter }))
  yield put(setDataCenters(dataCentersInternal))

  // collect and convert all from dataCentersApi.data_center[*].storage_domains.storage_domain[*]
  const storageDomainsInternal = []
  for (const dataCenter of dataCentersApi.data_center) {
    const storageDomains = dataCenter.storage_domains && dataCenter.storage_domains.storage_domain
    if (storageDomains) {
      storageDomainsInternal.push(
        ...storageDomains.map(storageDomain => Api.storageDomainToInternal({ storageDomain })))
    }
  }
  const storageDomainsMerged = mergeStorageDomains(storageDomainsInternal)
  yield put(setStorageDomains(storageDomainsMerged))
}

/**
 * @param {Array<StorageDomainInternal>} storageDomainsInternal list of all storage domains.
 *                                       It may contain single storage multiple times with status for different data
 *                                       center.
 * @return {Array<StorageDomainInternal>} List of storage domains with merged statuses. Each storage domain from input
 *                                        is listed exactly once.
 */
function mergeStorageDomains (storageDomainsInternal) {
  const idToStorageDomain = storageDomainsInternal.reduce((accum, storageDomain) => {
    const existingStorageDomain = accum[storageDomain.id]
    if (!existingStorageDomain) {
      accum[storageDomain.id] = storageDomain
      return accum
    }
    Object.assign(existingStorageDomain.statusPerDataCenter, storageDomain.statusPerDataCenter)
    return accum
  }, {})
  const mergedStorageDomains = Object.values(idToStorageDomain)
  return mergedStorageDomains
}

function* fetchAllClusters (action) {
  const clusters = yield callExternalAction('getAllClusters', Api.getAllClusters, action)

  if (clusters && clusters['cluster']) {
    const clustersInternal = clusters.cluster.map(cluster => Api.clusterToInternal({ cluster }))
    yield put(setClusters(clustersInternal))
  }
}

function* fetchAllHosts (action) {
  const hosts = yield callExternalAction('getAllHosts', Api.getAllHosts, action)

  if (hosts && hosts['host']) {
    const hostsInternal = hosts.host.map(host => Api.hostToInternal({ host }))
    yield put(setHosts(hostsInternal))
  }
}

function* fetchAllOS (action) {
  const operatingSystems = yield callExternalAction('getAllOperatingSystems', Api.getAllOperatingSystems, action)

  if (operatingSystems && operatingSystems['operating_system']) {
    const operatingSystemsInternal = operatingSystems.operating_system.map(os => Api.OSToInternal({ os }))
    yield put(setOperatingSystems(operatingSystemsInternal))
    // load icons for OS
    yield fetchUnknownIconsForVms({ os: operatingSystemsInternal })
  }
}

function* fetchVmsNics ({ vms }) {
  yield all(vms.map((vm) => call(function* () {
    const nicsInternal = yield fetchVmNics({ vmId: vm.id })
    yield put(setVmNics({ vmId: vm.id, nics: nicsInternal }))
  })))
}

function* fetchVmNics ({ vmId }) {
  const nics = yield callExternalAction('getVmsNic', Api.getVmsNic, { type: 'GET_VM_NICS', payload: { vmId } })

  if (nics && nics['nic']) {
    const nicsInternal = nics.nic.map(nic => Api.nicToInternal({ nic }))
    return nicsInternal
  }
  return []
}

function* fetchVmsSnapshots ({ vms }) {
  yield all(vms.map((vm) => call(function* () {
    yield fetchVmSnapshots({ vmId: vm.id })
  })))
}

export function* fetchVmSnapshots ({ vmId }) {
  const snapshots = yield callExternalAction('snapshots', Api.snapshots, { type: 'GET_VM_SNAPSHOT', payload: { vmId } })
  let snapshotsInternal = []

  if (snapshots && snapshots['snapshot']) {
    snapshotsInternal = snapshots.snapshot.map(snapshot => Api.snapshotToInternal({ snapshot }))
  }
  yield put(setVmSnapshots({ vmId, snapshots: snapshotsInternal }))
}

function* fetchISOStorages (action) {
  // If https://bugzilla.redhat.com/show_bug.cgi?id=1436403 was implemented,
  // this could fetch just ISO storage domain types
  const storages = yield callExternalAction('getStorages', Api.getStorages, action)
  if (storages && storages['storage_domain']) {
    const isoStorageDomains = storages.storage_domain
      .filter(storageDomain => storageDomain.type === 'iso')
      .map(storageDomain => Api.storageDomainToInternal({ storageDomain }))
    yield put(addStorageDomains(isoStorageDomains))

    const isoFilesFetches = isoStorageDomains.map(isoStorageDomain => fetchAllFilesForISO(isoStorageDomain.id))
    yield all(isoFilesFetches)
  }
}

function* fetchAllFilesForISO (storageDomainId) {
  const files = yield callExternalAction('getStorageFiles', Api.getStorageFiles, { payload: { storageId: storageDomainId } })
  if (files && files['file']) {
    const filesInternal = files.file.map(file => Api.fileToInternal({ file }))
    yield put(setStorageDomainsFiles(storageDomainId, filesInternal))
  }
}

function* fetchUSBFilter (action) {
  const usbFilter = yield callExternalAction('getUSBFilter', Api.getUSBFilter, action)
  if (usbFilter) {
    yield put(setUSBFilter({ usbFilter }))
  }
}

function* fetchAllVnicProfiles (action) {
  const vnicProfiles = yield callExternalAction('getAllVnicProfiles', Api.getAllVnicProfiles, action)
  if (vnicProfiles && vnicProfiles['vnic_profile']) {
    const vnicProfilesInternal = vnicProfiles.vnic_profile.map(vnicProfile => Api.vnicProfileToInternal({ vnicProfile }))
    yield put(setVnicProfiles({ vnicProfiles: vnicProfilesInternal }))
    if (!compareVersionToCurrent({ major: 4, minor: 2 })) {
      yield fetchAllNetworks()
    }
  }
}

function* fetchAllNetworks () {
  const networks = yield callExternalAction('getAllNetworks', Api.getAllNetworks, { type: 'GET_ALL_NETWORKS' })
  if (networks && networks['network']) {
    const networksInternal = networks.network.map(network => Api.networkToInternal({ network }))
    yield put(addNetworksToVnicProfiles({ networks: networksInternal }))
  }
}

function* delayedRemoveActiveRequest ({ payload: requestId }) {
  yield delay(500)
  yield put(removeActiveRequest(requestId))
}

function* startSchedulerWithFixedDelay (action) {
  // if a scheduler is already running, stop it
  yield put(stopSchedulerFixedDelay())

  // run a new scheduler
  yield schedulerWithFixedDelay(action.payload.delayInSeconds)
}

let _SchedulerCount = 0

function* schedulerWithFixedDelay (delayInSeconds = AppConfiguration.schedulerFixedDelayInSeconds) {
  const myId = _SchedulerCount++
  logDebug(`⏰ schedulerWithFixedDelay[${myId}] starting fixed delay scheduler`)

  let enabled = true
  while (enabled) {
    logDebug(`⏰ schedulerWithFixedDelay[${myId}] stoppable delay for: ${delayInSeconds}`)
    const { stopped } = yield race({
      stopped: take(STOP_SCHEDULER_FIXED_DELAY),
      fixedDelay: call(delay, (delayInSeconds * 1000)),
    })

    if (stopped) {
      enabled = false
      logDebug(`⏰ schedulerWithFixedDelay[${myId}] scheduler has been stopped`)
    } else {
      logDebug(`⏰ schedulerWithFixedDelay[${myId}] running after delay of: ${delayInSeconds}`)

      const oVirtVersion = Selectors.getOvirtVersion()
      if (oVirtVersion.get('passed')) {
        yield refreshData(refresh({
          quiet: true,
          shallowFetch: true,
          page: Selectors.getCurrentPage(),
        }))
      } else {
        logDebug(`⏰ schedulerWithFixedDelay[${myId}] event skipped since oVirt API version does not match`)
      }
    }
  }
}

export function* rootSaga () {
  yield all([
    takeEvery(LOGIN, login),
    takeEvery(LOGOUT, logout),
    takeLatest(CHECK_TOKEN_EXPIRED, doCheckTokenExpired),

    takeEvery(START_SCHEDULER_FIXED_DELAY, startSchedulerWithFixedDelay),
    // STOP_SCHEDULER_FIXED_DELAY is taken by `schedulerWithFixedDelay()`
    throttle(1000, REFRESH_DATA, refreshData),

    throttle(100, GET_BY_PAGE, fetchByPage),
    throttle(100, GET_VMS_BY_PAGE, fetchVmsByPage),
    throttle(100, GET_VMS_BY_COUNT, fetchVmsByCount),
    throttle(100, GET_POOLS_BY_COUNT, fetchPoolsByCount),
    throttle(100, GET_POOLS_BY_PAGE, fetchPoolsByPage),
    takeLatest(PERSIST_STATE, persistStateSaga),

    takeEvery(SHUTDOWN_VM, shutdownVm),
    takeEvery(RESTART_VM, restartVm),
    takeEvery(START_VM, startVm),
    takeEvery(SUSPEND_VM, suspendVm),
    takeEvery(START_POOL, startPool),
    takeEvery(REMOVE_VM, removeVm),

    takeEvery(CHECK_CONSOLE_IN_USE, getConsoleInUse),
    takeEvery(DOWNLOAD_CONSOLE_VM, downloadVmConsole),
    takeEvery(GET_RDP_VM, getRDPVm),

    takeLatest(GET_ALL_CLUSTERS, fetchAllClusters),
    takeLatest(GET_ALL_TEMPLATES, fetchAllTemplates),
    takeLatest(GET_ALL_STORAGE_DOMAINS, fetchAllAttachedStorageDomains),
    takeLatest(GET_ALL_OS, fetchAllOS),
    takeLatest(GET_ALL_HOSTS, fetchAllHosts),
    takeLatest(GET_ALL_VNIC_PROFILES, fetchAllVnicProfiles),
    throttle(100, GET_ISO_STORAGE_DOMAINS, fetchISOStorages),

    takeEvery(SELECT_VM_DETAIL, selectVmDetail),
    takeEvery(ADD_VM_NIC, addVmNic),
    takeEvery(DELETE_VM_NIC, deleteVmNic),
    takeEvery(GET_CONSOLE_OPTIONS, getConsoleOptions),
    takeEvery(SAVE_CONSOLE_OPTIONS, saveConsoleOptions),

    takeEvery(SELECT_POOL_DETAIL, selectPoolDetail),
    takeEvery(GET_USB_FILTER, fetchUSBFilter),
    takeEvery(DELAYED_REMOVE_ACTIVE_REQUEST, delayedRemoveActiveRequest),

    // Sagas from Components
    ...vmEditSagas,
    ...vmDisksSagas,
    ...newDiskDialogSagas,
    ...vmSnapshotsSagas,
  ])
}
