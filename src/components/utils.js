// @flow

import Selectors from '../selectors'
import type { VmType } from '../ovirtapi/types'
/**
 * @param osName guest OS code name, e.g. 'rhel_7x64'
 * @return human friendly guest OS name, e.g. 'Red Hat Enterprise Linux 7.x x64'
 */
export function getOsHumanName (osName: string): string {
  const os = Selectors.getOperatingSystemByName(osName)
  return (os && os.get('description')) || osName
}

export function getVmIcon (icons: Object, operatingSystems: Array<Object>, vm: Object): Object {
  return icons.get(getVmIconId(operatingSystems, vm))
}

export function isValidOsIcon (operatingSystems: Array<Object>, iconId: string): boolean {
  return !!operatingSystems.find((v, k) => v.getIn(['icons', 'large', 'id']) === iconId)
}

export function getVmIconId (operatingSystems: Array<Object>, vm: Object): Object {
  let iconId = vm.getIn(['icons', 'large', 'id'])

  // api can reference old os icon, otherwise use custom icon
  if (isValidOsIcon(operatingSystems, iconId)) {
    // get current os icon
    const vmOs = operatingSystems.find((v, k) => v.get('name') === vm.getIn(['os', 'type']))
    if (vmOs) {
      iconId = vmOs.getIn(['icons', 'large', 'id'])
    }
  }
  return iconId
}

export function isRunning (status: string): boolean {
  console.log('---------- status: ', status)
  return ['wait_for_launch', 'up', 'powering_up', 'powering_down', 'migrating', 'paused'].includes(status)
}

export function getMinimizedString (str: string, maxChar: number): string {
  return str.length > maxChar ? `${str.substring(0, maxChar - 3)}...` : str
}

export function getFilteredClusters (clusters: Array<Object>, config: Object): Array<Object> {
  const userId = config.getIn(['user', 'id'])
  const allowedPermissions = [
    'VmCreator',
    'PowerUserRole',
    'ClusterAdmin',
    'DataCenterAdmin',
    'UserVmManager',
    'UserVmRunTimeManager',
    'SuperUser',
  ]
  return clusters.filter((cluster: Object): boolean => {
    const filteredRoles = cluster.get('permissions').filter((role) => (
      role.get('userId') === userId && allowedPermissions.includes(role.get('name'))
    ))
    return !!filteredRoles.size
  })
}

export function doesUserCanEditVm (vm: VmType, config: Object): boolean {
  const userId = config.getIn(['user', 'id'])
  const allowedPermissions = [
    'ClusterAdmin',
    'DataCenterAdmin',
    'UserVmManager',
    'UserVmRunTimeManager',
    'SuperUser',
  ]
  const filteredRoles = vm.get('permissions').filter((role) => (
    role.get('userId') === userId && allowedPermissions.includes(role.get('name'))
  ))
  return !!filteredRoles.size
}
