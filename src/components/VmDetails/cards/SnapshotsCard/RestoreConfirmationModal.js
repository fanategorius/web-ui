import React from 'react'
import PropsTypes from 'prop-types'
import { connect } from 'react-redux'

import { Icon, MessageDialog } from 'patternfly-react'
import { msg } from '../../../../intl'
import { restoreVmSnapshot } from './actions'

const getMinimazedString = (str, maxChar) => (
  str.length > maxChar ? `${str.substring(0, maxChar - 3)}...` : str
)

class RestoreConfirmationModal extends React.Component {
  constructor (props) {
    super(props)
    this.state = { showModal: false }
    this.open = this.open.bind(this)
    this.close = this.close.bind(this)
    this.handleRestore = this.handleRestore.bind(this)
  }

  open () {
    this.setState({ showModal: true })
  }

  close () {
    this.setState({ showModal: false })
  }
  handleRestore () {
    this.props.onRestore()
    this.close()
  }

  render () {
    const { snapshot, children } = this.props

    const icon = <Icon type='pf' name='warning-triangle-o' />
    const trigger = children ? React.cloneElement(children, { onClick: this.open }) : <a onClick={this.open}><Icon type='fa' name='play-circle' /></a>

    return (
      <React.Fragment>
        {trigger}
        <MessageDialog
          show={this.state.showModal}
          onHide={this.close}
          primaryAction={this.handleRestore}
          secondaryAction={this.close}
          primaryActionButtonContent={msg.restore()}
          secondaryActionButtonContent={msg.cancel()}
          title={msg.confirmRestore()}
          icon={icon}
          primaryContent={<p className='lead' dangerouslySetInnerHTML={{ __html: msg.areYouSureYouWantToRestoreSnapshot({ snapshotName: `"<strong>${getMinimazedString(snapshot.get('description'), 100)}</strong>"` }) }} />}
        />
      </React.Fragment>
    )
  }
}

RestoreConfirmationModal.propTypes = {
  snapshot: PropsTypes.object.isRequired,
  vmId: PropsTypes.string.isRequired, // eslint-disable-line react/no-unused-prop-types
  children: PropsTypes.node,
  onRestore: PropsTypes.func.isRequired,
}

export default connect(
  (state) => ({}),
  (dispatch, { vmId, snapshot }) => ({
    onRestore: () => dispatch(restoreVmSnapshot({ vmId, snapshotId: snapshot.get('id') })),
  })
)(RestoreConfirmationModal)
