// @flow

import Api, { Transforms } from '_/ovirtapi'
import {
  all,
  put,
  select,
  takeLatest,
  call,
  takeEvery,
} from 'redux-saga/effects'

import * as A from '_/actions'
import { callExternalAction } from './utils'

import * as C from '_/constants'

import type { SaveGlobalOptionsActionType } from '_/actions/types'
import type { UserOptionType, RemoteUserOptionsType } from '_/ovirtapi/types'
import { generateUnique } from '_/helpers'

/**
 * Internal type to formalize result returned from
 * saveSSHKey and saveRemoteOptions sagas.
 */
type ResultType = {
  // name of the field submitted as changed
  change: string,
  // true if no changes were detected
  // all submitted values are the same as currently stored
  sameAsCurrent: boolean,
  // true if error was reported by ovirtapi query
  error: boolean,
  // query specific data packed into one object
  data: Object
}

/**
 * Simple mapper providing default values and type safety.
 */
function toResult ({ error = false, change = undefined, sameAsCurrent = false, ...data }: Object = {}): ResultType {
  return {
    change,
    sameAsCurrent,
    error,
    data,
  }
}

function* fetchSSHKey (action: Object): any {
  const result = yield call(callExternalAction, Api.getSSHKey, action)
  if (result.error) {
    return
  }

  yield put(A.setSSHKey(Transforms.SSHKey.toInternal({ sshKey: result })))
}

function* saveSSHKey ([sshPropName, submittedKey]: any): any | ResultType {
  if (submittedKey === undefined) {
    // check strictly for undefined
    // it should be possible to clear ssh key by setting to empty string
    return toResult()
  }

  const [sshId, currentKey, userId] = yield select(({ options, config }) => ([
    options.getIn(['ssh', 'id']),
    options.getIn(['ssh', 'key']),
    config.getIn(['user', 'id']),
  ]))

  if (currentKey === submittedKey) {
    return toResult({ change: sshPropName, sameAsCurrent: true })
  }

  const result = yield call(
    callExternalAction,
    Api.saveSSHKey,
    A.saveSSHKey({ sshId, key: submittedKey, userId }),
    true)

  return toResult({ ...result, change: sshPropName })
}

function* fetchUserOptions (action: Object): any {
  const result = yield call(callExternalAction, Api.fetchUserOptions, action)
  if (!result || result.error) {
    return
  }

  const remoteOptions: RemoteUserOptionsType = Transforms.RemoteUserOptions.toInternal(result)

  yield put(A.loadUserOptions(remoteOptions))

  const {
    locale,
    persistLocale: { content: persistLocale = true } = {},
  } = remoteOptions

  const { payload: { isLogin } = {} } = action

  if (isLogin && !locale && persistLocale) {
    // locale is not saved on the server and locale persistence is enabled
    yield put({ type: C.EXPORT_LOCALE })
  }
}

function* exportInferredLocale (): any {
  // export the current content of Redux store
  // it should contain locale inferred by intl scripts (or set by the user via Account Settings)
  const currentLocale = yield select(state => state.options.getIn(['remoteOptions', 'locale', 'content']))
  yield put(A.saveGlobalOptions({ values: { language: currentLocale } }, { transactionId: generateUnique('exportInferredLocale_') }))
}

/**
 * Remote options are options that are persisted on the server as JSON blob.
 * Note that there are also client-only options that do not need uploading.
 * Exception: SSH keys are remote but are handled separately.
 *
 * @param {*} newOptions options declared as new
  */
function* saveRemoteOption ([name, value]: any): any | ResultType {
  if (value === undefined) {
    // no values were submitted
    return toResult()
  }

  const [userId, currentValue, optionId] = yield select(({ options, config }) => [
    config.getIn(['user', 'id']),
    options.getIn(['remoteOptions', name, 'content']),
    options.getIn(['remoteOptions', name, 'id']),
  ])

  // missing option ID indicates that the option does not exist on the server
  if (value === currentValue && optionId) {
    return toResult({ change: name, sameAsCurrent: true })
  }
  const result = yield commitSaveRemoteOption({ name, value, userId, currentValue, optionId })
  return result
}

function* commitSaveRemoteOption ({ name, value, userId, currentValue, optionId }: any): any | ResultType {
  const result = (yield call(
    callExternalAction,
    Api.persistUserOption,
    A.persistUserOption({ name, content: value, optionId, userId }),
    true
  ))

  if (result.error) {
    return toResult({ ...result, change: name })
  }

  const parsedResult: ?[string, UserOptionType<any>] = Transforms.RemoteUserOption.toInternal(result)
  if (!parsedResult) {
    console.error('Failed to parse the response', result)
    return toResult({ ...result, error: true, change: name })
  }

  const [parsedName, parsedValue] = parsedResult
  return toResult({
    ...result,
    name: parsedName,
    value: parsedValue,
    change: name,
  })
}

function* saveLocale ([localePropName, submittedLocale]: any, persistLocale: ?boolean): any | ResultType {
  const currentPersistLocale = yield select(state => state.options.getIn(['remoteOptions', 'persistLocale', 'content']))
  const enableLocaleChange = persistLocale || (persistLocale === undefined && currentPersistLocale)

  if (enableLocaleChange) {
    const remoteResult = yield call(saveRemoteOption, [localePropName, submittedLocale])
    return remoteResult
  }

  if (submittedLocale) {
    return { change: true, data: { name: localePropName, value: { content: submittedLocale, id: undefined } } }
  }
  return {}
}

function* saveGlobalOptions ({
  payload: {
    autoconnect,
    sshKey,
    showNotifications,
    notificationSnoozeDuration,
    language,
    refreshInterval,
    persistLocale,
    preferredConsole,
    fullScreenVnc,
    fullScreenNoVnc,
    ctrlAltEndVnc,
    fullScreenSpice,
    ctrlAltEndSpice,
    smartcardSpice,
    viewForVirtualMachines,
  }, meta: { transactionId },
}: SaveGlobalOptionsActionType): Generator<any, any, any> {
  const { ssh, locale, shouldPersistLocale, ...standardRemoteOptions } = yield all({
    ssh: call(saveSSHKey, ...Object.entries({ sshKey })),
    locale: call(saveLocale, ...Object.entries({ locale: language }), persistLocale),
    shouldPersistLocale: call(saveRemoteOption, ...Object.entries({ persistLocale })),
    refresh: call(saveRemoteOption, ...Object.entries({ refreshInterval })),
    preferredConsole: call(saveRemoteOption, ...Object.entries({ preferredConsole })),
    fullScreenVnc: call(saveRemoteOption, ...Object.entries({ fullScreenVnc })),
    fullScreenNoVnc: call(saveRemoteOption, ...Object.entries({ fullScreenNoVnc })),
    ctrlAltEndVnc: call(saveRemoteOption, ...Object.entries({ ctrlAltEndVnc })),
    fullScreenSpice: call(saveRemoteOption, ...Object.entries({ fullScreenSpice })),
    ctrlAltEndSpice: call(saveRemoteOption, ...Object.entries({ ctrlAltEndSpice })),
    smartcardSpice: call(saveRemoteOption, ...Object.entries({ smartcardSpice })),
    autoconnect: call(saveRemoteOption, ...Object.entries({ autoconnect })),
    viewForVirtualMachines: call(saveRemoteOption, ...Object.entries({ viewForVirtualMachines })),
  })

  yield all(
    ((Object.values(standardRemoteOptions): Array<any>): Array<ResultType>)
      .filter(result => !result.error && result.change && !result.sameAsCurrent)
      .map(({ data: { name, value } }) => put(A.setOption({ key: ['remoteOptions', name], value })))
  )

  if (!shouldPersistLocale.error && shouldPersistLocale.change && !shouldPersistLocale.sameAsCurrent) {
    const { name, value } = shouldPersistLocale.data
    yield put(A.setOption({ key: ['remoteOptions', name], value }))

    if (!value.content) {
      yield call(deleteOnlyRemoteUserOption, 'locale')
    } else if (!language) {
      yield put({ type: C.EXPORT_LOCALE })
    }
  }

  if (!locale.error && locale.change && !locale.sameAsCurrent) {
    const { name, value } = locale.data
    yield put(A.setOption({ key: ['remoteOptions', name], value }))
  }

  if (!ssh.error && ssh.change && !ssh.sameAsCurrent) {
    yield put(A.setSSHKey(Transforms.SSHKey.toInternal({ sshKey: ssh.data })))
  }

  if (showNotifications !== undefined || notificationSnoozeDuration !== undefined) {
    yield call(
      updateNotifications,
      {
        current: yield select((state) => state.options.getIn(['localOptions', 'showNotifications'])),
        next: showNotifications,
      },
      {
        current: yield select((state) => state.options.getIn(['localOptions', 'notificationSnoozeDuration'])),
        next: notificationSnoozeDuration,
      })
  }

  yield put(
    A.setOption(
      { key: ['lastTransactions', 'global'], value: { transactionId } }
    )
  )
}

function* deleteOnlyRemoteUserOption (optionName: string): any {
  const { optionId, userId, optionValue } = yield select(({ options, config }) => ({
    optionId: options.getIn(['remoteOptions', optionName, 'id']),
    optionValue: options.getIn(['remoteOptions', optionName, 'content']),
    userId: config.getIn(['user', 'id']),
  }))

  const { error } = yield deleteRemoteUserOption(A.deleteUserOption({ optionId, userId }))

  if (!error) {
    yield put(A.setOption({ key: ['remoteOptions', optionName], value: { id: undefined, content: optionValue } }))
  }
}

function* deleteRemoteUserOption (action: any): any {
  const result = yield call(
    callExternalAction,
    Api.deleteUserOption,
    action,
    true
  )
  return result
}

function* saveRemoteSilently ({ payload: { name, value } }: any): any {
  const [userId, currentValue, optionId] = yield select(({ options, config }) => [
    config.getIn(['user', 'id']),
    options.getIn(['remoteOptions', name, 'content']),
    options.getIn(['remoteOptions', name, 'id']),
  ])

  if (value !== currentValue) {
    // set the value immediately for better user experience
    yield put(A.setOption({ key: ['remoteOptions', name], value: { id: undefined, content: value } }))
  }

  if (value === currentValue && optionId) {
    // the remote is already up to date
    return
  }

  // update the remote
  const result = yield commitSaveRemoteOption({ name, value, userId, currentValue, optionId })
  // ignore failure
  yield put(A.setOption({ key: ['remoteOptions', name], value: { id: result?.data?.value?.id, content: value } }))
}

function* updateNotifications (show: {current: boolean, next?: boolean}, snooze: {current: number, next?: number}): any {
  const snoozeDuration = snooze.next || snooze.current
  const showNotifications = show.next === undefined ? show.current : show.next
  const snoozeUntilPageReload = snoozeDuration === Number.MAX_SAFE_INTEGER

  yield put(A.setOption({ key: ['localOptions', 'showNotifications'], value: showNotifications }))
  yield put(A.setOption({ key: ['localOptions', 'notificationSnoozeDuration'], value: snoozeDuration }))
  yield put(A.setAutoAcknowledge(!showNotifications))
  if (showNotifications || snoozeUntilPageReload) {
    yield put(A.cancelResumeNotificationsTimer())
  } else {
    // minutes -> seconds
    yield put(A.startResumeNotificationsTimer(snoozeDuration * 60))
  }
}

export function* resumeNotifications (): any {
  yield call(
    updateNotifications,
    {
      current: yield select((state) => state.options.getIn(['localOptions', 'showNotifications'])),
      next: true,
    },
    {
      current: yield select((state) => state.options.getIn(['localOptions', 'notificationSnoozeDuration'])),
    })
}

export function* loadUserOptions ({ isLogin = false }: any = {}): any {
  const userId = yield select(state => state.config.getIn(['user', 'id']))
  yield put(A.getSSHKey({ userId }))
  yield put(A.fetchUserOptions({ userId, isLogin }))
}

export default ([
  takeLatest(C.SAVE_SSH_KEY, saveSSHKey),
  takeLatest(C.SAVE_GLOBAL_OPTIONS, saveGlobalOptions),
  takeLatest(C.GET_SSH_KEY, fetchSSHKey),
  takeLatest(C.FETCH_OPTIONS, fetchUserOptions),
  takeLatest(C.EXPORT_LOCALE, exportInferredLocale),
  takeEvery(C.DELETE_USER_OPTION, deleteRemoteUserOption),
  takeEvery(C.SAVE_USER_OPTION_SILENTLY, saveRemoteSilently),
]: Array<any>)
