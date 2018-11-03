// @flow
/* eslint-disable flowtype/require-return-type */

import type { DiskType } from '../ovirtapi/types'
import {
  CREATE_DISK_FOR_VM,
  REMOVE_DISK,
} from '../constants'

export function createDiskForVm ({ vmId, disk }: { vmId: string, disk: DiskType }) {
  return {
    type: CREATE_DISK_FOR_VM,
    payload: {
      vmId,
      disk,
    },
  }
}

export function removeDisk ({ diskId, vmToRefreshId }: { diskId: string, vmToRefreshId?: string }) {
  return {
    type: REMOVE_DISK,
    payload: {
      diskId,
      vmToRefreshId,
    },
  }
}
