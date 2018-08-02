import React from 'react'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'
import { RouterPropTypeShapes } from '../../propTypeShapes'

import VmDialog from '../VmDialog'
import VmsList from '../VmsList'
import VmDetails from '../VmDetails'

import { selectVmDetail, selectPoolDetail, getIsoStorageDomains, getConsoleOptions } from '../../actions'

/**
 * Route component (for PageRouter) to view the list of VMs and Pools
 */
const VmsPage = () => {
  return <VmsList />
}

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
      return (<VmDetails vm={vms.getIn(['pools', poolId, 'vm'])} pool={vms.getIn(['pools', poolId])} />)
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

  render () {
    const { previousPath } = this.props
    return <VmDialog previousPath={previousPath} />
  }
}
VmCreatePage.propTypes = {
  previousPath: PropTypes.string.isRequired,
  getAvailableCDImages: PropTypes.func.isRequired,
}
const VmCreatePageConnected = connect(
  null,
  (dispatch) => ({
    getAvailableCDImages: () => dispatch(getIsoStorageDomains()),
  })
)(VmCreatePage)

/**
 * Route component (for PageRouter) to edit a VM
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

  render () {
    const { vms, previousPath } = this.props
    const { vmId } = this.state

    if (vmId && vms.getIn(['vms', vmId])) {
      return <VmDialog previousPath={previousPath} vm={vms.getIn(['vms', vmId])} />
    }

    // TODO: Add handling for if the fetch runs but fails (FETCH-FAIL), see issue #631
    console.info(`VmEditPage: VM id cannot be found: ${vmId}`)
    return null
  }
}
VmEditPage.propTypes = {
  vms: PropTypes.object.isRequired,
  previousPath: PropTypes.string.isRequired,
  match: RouterPropTypeShapes.match.isRequired,

  getAvailableCDImages: PropTypes.func.isRequired,
  getVmById: PropTypes.func.isRequired,
}
const VmEditPageConnected = connect(
  (state) => ({
    vms: state.vms,
  }),
  (dispatch) => ({
    getAvailableCDImages: () => dispatch(getIsoStorageDomains()),
    getVmById: (vmId) => dispatch(selectVmDetail({ vmId })),
  })
)(VmEditPage)

export {
  PoolDetailsPageConnected as PoolDetailsPage,
  VmDetailsPageConnected as VmDetailsPage,
  VmCreatePageConnected as VmCreatePage,
  VmEditPageConnected as VmEditPage,
  VmsPage,
}
