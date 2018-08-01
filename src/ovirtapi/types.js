// @flow
//
// Types used in the API and the types used internal to the App.
//

export type ApiVmType = Object
export type VmType = Object

export type ApiTemplateType = Object
export type TemplateType = Object

export type ApiPoolType = Object
export type PoolType = Object

export type ApiSnapshotType = Object // { description: string }
export type SnapshotType = Object

export type ApiDiskAttachmentType = Object
export type ApiDiskType = Object
export type DiskType = Object

export type ApiDataCenterType = Object
export type DataCenterType = Object

export type ApiStorageDomainType = Object
export type StorageDomainType = Object

export type ApiCdRomType = {
  id?: string,
  file?: {
    id: string
  }
}
export type CdRomType = {
  file: {
    id: string
  }
}

export type ApiStorageDomainFileType = Object
export type StorageDomainFileType = Object

export type ApiClusterType = Object
export type ClusterType = Object

export type ApiNicType = Object
export type NicType = Object

export type ApiVnicProfileType = Object
export type VnicProfileType = Object

export type ApiNetworkType = Object
export type NetworkType = Object

export type ApiHostType = Object
export type HostType = Object

export type ApiOsType = Object
export type OsType = Object

export type ApiIconType = Object
export type IconType = Object

export type ApiSshKeyType = Object
export type SshKeyType = Object

export type ApiVmConsolesType = Object
export type VmConsolesType = Object

export type ApiVmSessionsType = Object
export type VmSessionsType = Object

export type ApiCloudInitType = Object
export type CloudInitType = {
  enabled: boolean,
  hostName: string,
  sshAuthorizedKeys: string
}
