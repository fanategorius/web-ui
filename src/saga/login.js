import Product from '../version'
import Api from '../ovirtapi'
import AppConfiguration from '../config'
import OptionsManager from '../optionsManager'
import Selectors from '../selectors'

import { logDebug } from '../helpers'

import {
  call,
  put,
} from 'redux-saga/effects'

import {
  loginSuccessful,
  loginFailed,
  schedulerFixedDelay,

  loadInProgress,
  failedExternalAction,
  showTokenExpiredMessage,
  setOvirtApiVersion,

  setUserFilterPermission,
  setAdministrator,
  getOption,

  getByPage,
  getAllTemplates,
  getAllStorageDomains,
  getAllClusters,
  getAllHosts,
  getAllOperatingSystems,
  getAllVnicProfiles,

  downloadConsole,
  getUSBFilter,
  getSingleVm,

  updateVms,
} from '../actions/index'

import {
  callExternalAction,
  waitTillEqual,
} from './utils'

import {
  downloadVmConsole,
} from './consoles'

/**
 * Perform login checks, and if they pass, perform initial data loading
 */
export function* login (action) {
  const { payload: { token, userId, credentials: { username } } } = action
  yield put(loadInProgress({ value: true }))

  // Verify a SSO token exists
  let result = {} // Q? Why does this exists?
  if (!token) {
    yield put(loginFailed({
      errorCode: result['error_code'] ? result['error_code'] : 'no_access',
      message: result['error'] ? (result.error['statusText'] ? result.error['statusText'] : JSON.stringify(result['error'])) : 'Login Failed',
    }))
    yield put(loadInProgress({ value: false }))
    return
  }

  yield put(loginSuccessful({ token, username, userId }))

  // Verify the API (exists and is the correct version)
  const oVirtMeta = yield callExternalAction('getOvirtApiMeta', Api.getOvirtApiMeta, action)
  const versionOk = yield checkOvirtApiVersion(oVirtMeta)
  if (!versionOk) {
    console.error('oVirt API version check failed')
    yield put(failedExternalAction({
      message: composeIncompatibleOVirtApiVersionMessage(oVirtMeta),
      shortMessage: 'oVirt API version check failed',
    }))
    yield put(yield put(loadInProgress({ value: false })))
    return
  }

  // API checks passed.  Load user data and the initial app data
  yield fetchPermissionWithoutFilter()
  yield put(getUSBFilter())
  yield initialLoad() // loadInProgress set to false in here (via getByPage())
  yield autoConnectCheck()
  yield put(schedulerFixedDelay())
}

export function* doCheckTokenExpired (action) {
  try {
    yield call(Api.getOvirtApiMeta, action.payload)
    console.info('doCheckTokenExpired(): token is still valid') // info level: to pair former HTTP 401 error message with updated information
    return
  } catch (error) {
    if (error.status === 401) {
      console.info('Token expired, going to reload the page')
      yield put(showTokenExpiredMessage())

      // Reload the page after a delay
      // No matter saga is canceled for whatever reason, the reload must happen, so here comes the ugly setTimeout()
      setTimeout(() => {
        console.info('======= doCheckTokenExpired() issuing page reload')
        window.location.href = AppConfiguration.applicationURL
      }, 5 * 1000)
      return
    }
    console.error('doCheckTokenExpired(): unexpected oVirt API error: ', error)
  }
}

function composeIncompatibleOVirtApiVersionMessage (oVirtMeta) {
  const requested = `${Product.ovirtApiVersionRequired.major}.${Product.ovirtApiVersionRequired.minor}`
  let found
  if (!(oVirtMeta && oVirtMeta['product_info'] && oVirtMeta['product_info']['version'] &&
      oVirtMeta['product_info']['version']['major'] && oVirtMeta['product_info']['version']['minor'])) {
    found = JSON.stringify(oVirtMeta)
  } else {
    const version = oVirtMeta['product_info']['version']
    found = `${version.major}.${version.minor}`
  }
  return `oVirt API version requested >= ${requested}, but ${found} found`
}

export function compareVersion (actual, required) {
  logDebug(`compareVersion(), actual=${JSON.stringify(actual)}, required=${JSON.stringify(required)}`)

  // assuming backward compatibility of oVirt API
  if (actual.major >= required.major) {
    if (actual.major === required.major) {
      if (actual.minor < required.minor) {
        return false
      }
    }
    return true
  }
  return false
}

/**
 * Verify the API meta-data has version information available and that the version
 * is compatible with our expected API version.
 */
function* checkOvirtApiVersion (oVirtMeta) {
  if (!(oVirtMeta &&
        oVirtMeta['product_info'] &&
        oVirtMeta['product_info']['version'] &&
        oVirtMeta['product_info']['version']['major'] &&
        oVirtMeta['product_info']['version']['minor'])) {
    console.error('Incompatible oVirt API version: ', oVirtMeta)
    yield put(setOvirtApiVersion({ passed: false, ...oVirtMeta }))
    return false
  }

  const actual = oVirtMeta['product_info']['version']
  const required = Product.ovirtApiVersionRequired
  const passed = compareVersion({
    major: parseInt(actual.major),
    minor: parseInt(actual.minor),
  }, required)

  yield put(setOvirtApiVersion({ passed, ...actual }))
  return passed
}

export function* logout () {
  window.location.href = `${AppConfiguration.applicationURL}/sso/logout`
}

function* autoConnectCheck () {
  const vmId = OptionsManager.loadAutoConnectOption()
  if (vmId && vmId.length > 0) {
    const vm = yield callExternalAction('getVm', Api.getVm, getSingleVm({ vmId }), true)
    if (vm && vm.error && vm.error.status === 404) {
      OptionsManager.clearAutoConnect()
    } else if (vm && vm.id && vm.status !== 'down') {
      const internalVm = Api.vmToInternal({ vm })
      yield put(updateVms({ vms: [internalVm] }))
      yield downloadVmConsole(downloadConsole({ vmId }))
    }
  }
}

function* initialLoad () { // NOTE: This is an in-order fetch, could be made parallel?
  yield put(getAllClusters()) // no shallow
  yield put(getAllHosts())
  yield put(getAllOperatingSystems())
  yield put(getAllTemplates({ shallowFetch: false }))
  yield put(getAllStorageDomains())
  yield put(getAllVnicProfiles())

  yield put(getByPage({ page: 1 })) // first page of VMs list, sets _loadInProgress_ to false when done
}

function* fetchPermissionWithoutFilter () {
  const data = yield callExternalAction('checkFilter', Api.checkFilter, { action: 'CHECK_FILTER' }, true)

  const isAdmin = data.error === undefined
  yield put(setAdministrator(isAdmin))

  if (!isAdmin) {
    yield put(setUserFilterPermission(true))
    return
  }

  const alwaysFilterOption = yield callExternalAction(
    'getOption',
    Api.getOption,
    getOption('AlwaysFilterResultsForWebUi', 'general', 'false'))

  const isAlwaysFilterOption = alwaysFilterOption === 'true'
  yield put(setUserFilterPermission(isAlwaysFilterOption))
  yield waitTillEqual(Selectors.getFilter, isAlwaysFilterOption, 50)
}
