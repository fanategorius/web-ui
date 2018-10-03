import React, { Component } from 'react'
import PropTypes from 'prop-types'

import { connect } from 'react-redux'
import { addVmSnapshot } from './actions'

import {
  Alert,
  Button,
  Col,
  Form,
  FormControl,
  FormGroup,
  HelpBlock,
  Icon,
  Modal,
  noop,
} from 'patternfly-react'
import { msg } from '../../../../intl'
import style from './style.css'

class NewSnapshotModal extends Component {
  constructor (props) {
    super(props)
    this.state = { showModal: false, description: '', emptyDescription: false }
    this.open = this.open.bind(this)
    this.close = this.close.bind(this)
    this.handleSave = this.handleSave.bind(this)
    this.handleDescriptionChange = this.handleDescriptionChange.bind(this)
  }

  open () {
    this.setState({ showModal: true })
  }

  close () {
    this.setState({ showModal: false, description: '', emptyDescription: false })
  }

  handleDescriptionChange (e) {
    this.setState({ description: e.target.value })
  }

  handleSave (e) {
    e.preventDefault()
    if (this.state.description.trim().length > 0) {
      const snapshot = {
        description: this.state.description,
      }
      this.props.onAdd({ snapshot })
      this.close()
    } else {
      this.setState({ emptyDescription: true })
    }
  }

  render () {
    return (
      <div>
        <a onClick={this.props.disabled ? noop : this.open} className={`${this.props.disabled && 'disabled'}`}>
          <Icon type='fa' name='plus' />
          { msg.createSnapshot() }
        </a>

        <Modal show={this.state.showModal} onHide={this.close} dialogClassName={style['create-snapshot-container']}>
          <Modal.Header>
            <button
              className='close'
              onClick={this.close}
              aria-hidden='true'
              aria-label='Close'
            >
              <Icon type='pf' name='close' />
            </button>
            <Modal.Title>{ msg.createSnapshot() }</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form onSubmit={this.handleSave} horizontal>
              <Col sm={12}>
                <Alert type='info'>
                  { msg.snapshotInfo() }
                </Alert>
              </Col>
              <FormGroup bsClass='form-group col-sm-12 required' validationState={this.state.emptyDescription ? 'error' : null}>
                <label className='col-sm-3 control-label'>
                  { msg.name() }
                </label>
                <div className='col-sm-9'>
                  <FormControl
                    type='text'
                    value={this.state.description}
                    onChange={this.handleDescriptionChange}
                  />
                  {
                    this.state.emptyDescription &&
                    <HelpBlock>
                      {msg.emptySnapshotDescription()}
                    </HelpBlock>
                  }
                </div>
              </FormGroup>
            </Form>
          </Modal.Body>
          <Modal.Footer>
            <Button
              bsStyle='default'
              className='btn-cancel'
              onClick={this.close}
            >
              { msg.cancel() }
            </Button>
            <Button bsStyle='primary' onClick={this.handleSave}>
              { msg.create() }
            </Button>
          </Modal.Footer>
        </Modal>
      </div>
    )
  }
}

NewSnapshotModal.propTypes = {
  vmId: PropTypes.string.isRequired, // eslint-disable-line react/no-unused-prop-types
  disabled: PropTypes.bool,
  onAdd: PropTypes.func.isRequired,
}

export default connect(
  (state) => ({}),
  (dispatch, { vmId }) => ({
    onAdd: ({ snapshot }) => dispatch(addVmSnapshot({ vmId, snapshot })),
  })
)(NewSnapshotModal)
