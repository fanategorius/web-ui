import React from 'react'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'
import { RouterPropTypeShapes } from '../../propTypeShapes'

import { push } from 'connected-react-router'

import { msg } from '../../intl'
import { canUserUseAnyClusters } from '../../utils'

import VmDialog from '../VmDialog'
import VmsList from '../VmsList'
import VmDetails from '../VmDetails'
import { default as LegacyVmDetails } from '../VmDetail'

import {
  addUserMessage,
  selectVmDetail,
  selectPoolDetail,
  getIsoStorageDomains,
  getConsoleOptions,
} from '../../actions'

/**
 * Route component (for PageRouter) to view the list of VMs and Pools
 */
const VmsPage = () => {
  return <VmsList />
}

/**
 * Route component (for PageRouter) to view a VM's details
 */
class LegacyVmDetailsPage extends React.Component {
  constructor (props) {
    super(props)
    this.state = {
      vmId: undefined,
    }
  }

  static getDerivedStateFromProps (props, state) {
    if (state.vmId !== props.match.params.id) {
      const vmId = props.match.params.id

      // Assume the VM is not in props.vms, was shallow fetched or is stale.
      // Force a refresh when it is selected for viewing.
      props.getConsoleOptions(vmId)
      props.getVmById(vmId)
      return { vmId }
    }

    return null
  }

  render () {
    const { vms } = this.props
    const { vmId } = this.state

    if (vmId && vms.getIn(['vms', vmId])) {
      return (<LegacyVmDetails vm={vms.getIn(['vms', vmId])} />)
    }

    // TODO: Add handling for if the fetch runs but fails (FETCH-FAIL), see issue #631
    console.info(`LegacyVmDetailsPage: VM id cannot be found: ${vmId}`)
    return null
  }
}
LegacyVmDetailsPage.propTypes = {
  vms: PropTypes.object.isRequired,
  match: RouterPropTypeShapes.match.isRequired,

  getVmById: PropTypes.func.isRequired,
  getConsoleOptions: PropTypes.func.isRequired,
}
const LegacyVmDetailsPageConnected = connect(
  (state) => ({
    vms: state.vms,
  }),
  (dispatch) => ({
    getVmById: (vmId) => dispatch(selectVmDetail({ vmId })),
    getConsoleOptions: (vmId) => dispatch(getConsoleOptions({ vmId })),
  })
)(LegacyVmDetailsPage)

/**
 * Route component (for PageRouter) to view a VM's details
 */
class VmDetailsPage extends React.Component {
  constructor (props) {
    super(props)
    this.state = {
      vmId: undefined,
    }
  }

  static getDerivedStateFromProps (props, state) {
    if (state.vmId !== props.match.params.id) {
      const vmId = props.match.params.id

      // Assume the VM is not in props.vms, was shallow fetched or is stale.
      // Force a refresh when it is selected for viewing.
      props.getConsoleOptions(vmId)
      props.getVmById(vmId)
      return { vmId }
    }

    return null
  }

  render () {
    const { vms } = this.props
    const { vmId } = this.state

    if (vmId && vms.getIn(['vms', vmId])) {
      return (<VmDetails vm={vms.getIn(['vms', vmId])} />)
    }

    // TODO: Add handling for if the fetch runs but fails (FETCH-FAIL), see issue #631
    console.info(`VmDetailPage: VM id cannot be found: ${vmId}`)
    return null
  }
}
VmDetailsPage.propTypes = {
  vms: PropTypes.object.isRequired,
  match: RouterPropTypeShapes.match.isRequired,

  getVmById: PropTypes.func.isRequired,
  getConsoleOptions: PropTypes.func.isRequired,
}
const VmDetailsPageConnected = connect(
  (state) => ({
    vms: state.vms,
  }),
  (dispatch) => ({
    getVmById: (vmId) => dispatch(selectVmDetail({ vmId })),
    getConsoleOptions: (vmId) => dispatch(getConsoleOptions({ vmId })),
  })
)(VmDetailsPage)

/**
 * Route component (for PageRouter) to view a Pool's details
 */
class PoolDetailsPage extends React.Component {
  constructor (props) {
    super(props)
    this.state = {
      poolId: undefined,
    }
  }

  static getDerivedStateFromProps (props, state) {
    if (state.poolId !== props.match.params.id) {
      const poolId = props.match.params.id

      // Assume the Pool is not in props.pools, was shallow fetched or is stale.
      // Force a refresh when it is selected for viewing.
      props.getPoolById(poolId)
      return { poolId }
    }

    return null
  }

  render () {
    const { vms } = this.props
    const { poolId } = this.state

    if (poolId && vms.getIn(['pools', poolId, 'vm'])) {
      // TODO: ux-redesign VmDetails will need to also handle viewing a Pool / Pool (template)? VM
      return (<LegacyVmDetails vm={vms.getIn(['pools', poolId, 'vm'])} pool={vms.getIn(['pools', poolId])} />)
    }

    // TODO: Add handling for if the fetch runs but fails (FETCH-FAIL), see issue #631
    console.info(`PoolDetailPage: Pool id cannot be found: ${poolId}`)
    return null
  }
}
PoolDetailsPage.propTypes = {
  vms: PropTypes.object.isRequired,
  match: RouterPropTypeShapes.match.isRequired,

  getPoolById: PropTypes.func.isRequired,
}
const PoolDetailsPageConnected = connect(
  (state) => ({
    vms: state.vms,
  }),
  (dispatch) => ({
    getPoolById: (poolId) => dispatch(selectPoolDetail({ poolId })),
  })
)(PoolDetailsPage)

/**
 * Route component (for PageRouter) to create a new VM
 */
class VmCreatePage extends React.Component {
  constructor (props) {
    super(props)
    props.getAvailableCDImages()
  }

  componentDidUpdate () {
    // If the user cannot create any VMs (not just the one requested), bump them out
    if (!this.props.canUserCreateVMs) {
      this.props.redirectToMainPage()
      this.props.addUserMessage(msg.permissionsNoCreateVm())
    }
  }

  render () {
    if (!this.props.canUserCreateVMs) {
      return null
    }

    const { previousPath } = this.props
    return <VmDialog previousPath={previousPath} />
  }
}
VmCreatePage.propTypes = {
  canUserCreateVMs: PropTypes.bool.isRequired,
  previousPath: PropTypes.string.isRequired,
  getAvailableCDImages: PropTypes.func.isRequired,
  redirectToMainPage: PropTypes.func.isRequired,
  addUserMessage: PropTypes.func.isRequired,
}
const VmCreatePageConnected = connect(
  (state) => ({
    canUserCreateVMs: canUserUseAnyClusters(state.clusters) && state.clusters.size > 0,
  }),
  (dispatch) => ({
    getAvailableCDImages: () => dispatch(getIsoStorageDomains()),
    redirectToMainPage: () => dispatch(push('/')),
    addUserMessage: (message) => dispatch(addUserMessage({ message })),
  })
)(VmCreatePage)

/**
 * Route component (for PageRouter) to edit a VM
 *
 * Only let a user view the `VmDialog` if they can 1. edit a VM in general (i.e. there
 * is at least 1 cluster they can use), and 2. edit the specific VM requested.
 */
class VmEditPage extends React.Component {
  constructor (props) {
    super(props)
    this.state = {
      vmId: undefined,
    }
  }

  static getDerivedStateFromProps (props, state) {
    if (state.vmId !== props.match.params.id) {
      const vmId = props.match.params.id

      // Assume the VM is not in props.vms, was shallow fetched or is stale.
      // Force a refresh when it is selected for editing.
      props.getAvailableCDImages()
      props.getVmById(vmId)
      return { vmId }
    }

    return null
  }

  componentDidUpdate () {
    // If the user cannot edit any VMs (not just the one requested), bump them out
    if (!this.props.canUserEditVMs) {
      this.props.redirectToMainPage()
      this.props.addUserMessage(msg.permissionsNoEditVm())
    }
  }

  render () {
    const {
      vms,
      previousPath,
      canUserEditVMs,
      redirectToMainPage,
      addUserMessage,
    } = this.props
    const { vmId } = this.state

    if (!canUserEditVMs) {
      return null
    }

    if (vmId && vms.getIn(['vms', vmId])) {
      // Verify the user can edit this specific VM
      if (!vms.getIn(['vms', vmId, 'canUserEditVm'])) {
        redirectToMainPage()
        addUserMessage(msg.permissionsNoEditThisVm({ name: vms.getIn(['vms', vmId, 'name']), vmId }))
        return null
      } else {
        return <VmDialog previousPath={previousPath} vm={vms.getIn(['vms', vmId])} />
      }
    }

    // TODO: Add handling for if the fetch runs but fails (FETCH-FAIL), see issue #631
    console.info(`VmEditPage: VM id cannot be found: ${vmId}`)
    return null
  }
}
VmEditPage.propTypes = {
  canUserEditVMs: PropTypes.bool.isRequired,
  vms: PropTypes.object.isRequired,
  previousPath: PropTypes.string.isRequired,
  match: RouterPropTypeShapes.match.isRequired,

  getAvailableCDImages: PropTypes.func.isRequired,
  getVmById: PropTypes.func.isRequired,
  redirectToMainPage: PropTypes.func.isRequired,
  addUserMessage: PropTypes.func.isRequired,
}
const VmEditPageConnected = connect(
  (state) => ({
    canUserEditVMs: canUserUseAnyClusters(state.clusters) && state.clusters.size > 0,
    vms: state.vms,
  }),
  (dispatch) => ({
    getAvailableCDImages: () => dispatch(getIsoStorageDomains()),
    getVmById: (vmId) => dispatch(selectVmDetail({ vmId })),
    redirectToMainPage: () => dispatch(push('/')),
    addUserMessage: (message) => dispatch(addUserMessage({ message })),
  })
)(VmEditPage)

export {
  PoolDetailsPageConnected as PoolDetailsPage,
  LegacyVmDetailsPageConnected as LegacyVmDetailsPage,
  VmDetailsPageConnected as VmDetailsPage,
  VmCreatePageConnected as VmCreatePage,
  VmEditPageConnected as VmEditPage,
  VmsPage,
}
