import { put } from 'redux-saga/effects'

import Api from '_/ovirtapi'
import Selectors from '../../selectors'
import OptionsManager from '../../optionsManager'
import logger from '../../logger'
import { fileDownload } from '_/helpers'
import {
  downloadConsole,
  getConsoleOptions as getConsoleOptionsAction,
  setConsoleInUse,
  setConsoleLogon,
  setConsoleOptions,
  setVmConsoles,
  vmActionInProgress,
  setConsoleTickets,
} from '_/actions'

import { callExternalAction } from '../utils'
import { fetchVmSessions } from '../../sagas'

import { adjustVVFile } from './vvFileUtils'
import RDPBuilder from './rdpBuilder'

import { push } from 'connected-react-router'
import { setActiveConsole, setConsoleNoVNC } from '../../actions'

// ----- Connection files
/**
 * Push a virt-viewer connection file (__console.vv__) to connect a user to a VM's console
 */
export function* downloadVmConsole (action) {
  let { vmId, consoleId, usbFilter, hasGuestAgent, force } = action.payload

  let isSpice = false
  logger.log(vmId)
  logger.log(consoleId)
  if (hasGuestAgent && !force) {
    let result = yield callExternalAction('vmLogon', Api.vmLogon, { payload: { vmId } }, true)
    if (!result || result.status !== 'complete') {
      yield put(setConsoleLogon({ vmId, isLogon: false }))
      return
    }
  }

  yield put(setConsoleLogon({ vmId, isLogon: true }))
  if (!consoleId) {
    yield put(vmActionInProgress({ vmId, name: 'getConsole', started: true }))
    const consolesInternal = yield fetchConsoleVmMeta({ vmId })
    yield put(setVmConsoles({ vmId, consoles: consolesInternal }))
    yield put(vmActionInProgress({ vmId, name: 'getConsole', started: false }))

    // TODO: choose user default over just "SPICE"
    if (consolesInternal && consolesInternal.length > 0) {
      let console = consolesInternal.find(c => c.protocol === 'spice') || consolesInternal[0]
      consoleId = console.id
      if (console.protocol === 'spice') {
        isSpice = true
      }
    }
  }

  if (consoleId) {
    let data = yield callExternalAction('console', Api.console, { type: 'INTERNAL_CONSOLE', payload: { vmId, consoleId } })
    if (data.error === undefined) {
      yield put(setActiveConsole({ vmId, consoleId }))
      let isRunning = Selectors.isNovncIsRunning({ vmId })
      /**
       *Download console if type is spice or novnc is running already
       */
      if (data.indexOf('type=spice') > -1 || (data.indexOf('type=spice') === -1 && isRunning)) {
        let options = Selectors.getConsoleOptions({ vmId })
        if (!options) {
          logger.log('downloadVmConsole() console options not yet present, trying to load from local storage')
          options = yield getConsoleOptions(getConsoleOptionsAction({ vmId }))
        }

        data = adjustVVFile({ data, options, usbFilter, isSpice })
        fileDownload({ data, fileName: `console.vv`, mimeType: 'application/x-virt-viewer' })
      } else {
        let data = yield callExternalAction('consoleProxyTicket', Api.consoleProxyTicket,
          { type: 'INTRENAL_CONSOLE', payload: { vmId, consoleId } })
        let ticket = yield callExternalAction('consoleTicket', Api.consoleTicket,
          { type: 'INTRENAL_CONSOLE', payload: { vmId, consoleId } })
        yield put(setConsoleTickets({ vmId, proxyTicket: data.proxy_ticket.value, ticket: ticket.ticket }))
        /**
         * Mark nvnc is running
         */
        yield put(setConsoleNoVNC(vmId))
        logger.log(data)
      }
    }
  }
  yield put(setConsoleInUse({ vmId, consoleInUse: null }))
  yield put(push('/vm/' + vmId + '/console/' + consoleId))
}

export function* openVmConsole (action) {
  let { vmId, consoleId } = action.payload
  if (!consoleId) {
    yield put(vmActionInProgress({ vmId, name: 'getConsole', started: true }))
    const consolesInternal = yield fetchConsoleVmMeta({ vmId })
    yield put(setVmConsoles({ vmId, consoles: consolesInternal }))
    yield put(vmActionInProgress({ vmId, name: 'getConsole', started: false }))
    // TODO: choose user default over just "SPICE"
    if (consolesInternal && consolesInternal.length > 0) {
      let console = consolesInternal.find(c => c.protocol === 'spice') || consolesInternal[0]
      consoleId = console.id
    }
  }
  let data = yield callExternalAction('consoleProxyTicket', Api.consoleProxyTicket,
    { type: 'INTRENAL_CONSOLE', payload: { vmId, consoleId } })
  let ticket = yield callExternalAction('consoleTicket', Api.consoleTicket,
    { type: 'INTRENAL_CONSOLE', payload: { vmId, consoleId } })
  yield put(setConsoleTickets({ vmId, proxyTicket: data.proxy_ticket.value, ticket: ticket.ticket }))
  logger.log(data)
  yield put(push('/vm/' + vmId + '/console/' + consoleId))
}

/**
 * Push a RDP connection file (__console.rdp__) to connect a user to the Windows VM's RDP session
 */
export function* getRDPVm (action) {
  const rdpBuilder = new RDPBuilder(action.payload)
  const data = rdpBuilder.buildRDP()
  fileDownload({ data, fileName: 'console.rdp', mimeType: 'application/rdp' })
}

// -----

export function* fetchConsoleVmMeta ({ vmId }) {
  const consoles = yield callExternalAction('consoles', Api.consoles, { type: 'INTERNAL_CONSOLES', payload: { vmId } })

  if (consoles && consoles['graphics_console']) { // && consoles['graphics_console'].length > 0) {
    return Api.consolesToInternal({ consoles })
  }
  return []
}

/**
 * Check the sessions on a VM and if someone other then the given user has an open
 * console, flag the console as "in use" requiring manual confirmation to open the
 * console (which will disconnect the other user's existing session).
 */
export function* getConsoleInUse (action) {
  let { vmId, usbFilter, userId, hasGuestAgent } = action.payload
  const sessionsInternal = yield fetchVmSessions({ vmId })
  const consoleUsers = sessionsInternal && sessionsInternal
    .filter(session => session.consoleUser)
    .map(session => session.user)

  if (consoleUsers.length > 0 && consoleUsers.find(user => user.id === userId) === undefined) {
    yield put(setConsoleInUse({ vmId, consoleInUse: true }))
  } else {
    yield put(setConsoleInUse({ vmId, consoleInUse: false }))
    yield put(downloadConsole({ vmId, usbFilter, hasGuestAgent }))
    yield put(setConsoleInUse({ vmId, consoleInUse: null }))
  }
}

// ----- Console Options (per VM) held by `OptionsManager`
export function* getConsoleOptions (action) {
  const options = OptionsManager.loadConsoleOptions(action.payload)
  yield put(setConsoleOptions({ vmId: action.payload.vmId, options }))
  return options
}

export function* saveConsoleOptions (action) {
  OptionsManager.saveConsoleOptions(action.payload)
  yield getConsoleOptions(getConsoleOptionsAction({ vmId: action.payload.vmId }))
}
