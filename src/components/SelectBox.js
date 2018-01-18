import React from 'react'
import PropTypes from 'prop-types'

import style from './sharedStyle.css'

const checkItems = (items) => {
  if (!Object.keys(items).length) {
    return { '': { id: '', value: '&nbsp' } }
  }
  return items
}

class SelectBox extends React.Component {
  constructor (props) {
    super(props)
    const items = checkItems(props.items)
    this.state = { selected: props.selected || Object.values(items)[0].id, changed: false }
    this.handleChange = this.handleChange.bind(this)
  }

  componentWillReceiveProps (nextProps) {
    if (!this.state.changed) {
      const items = checkItems(nextProps.items)
      this.setState({ selected: nextProps.selected || Object.values(items)[0].id })
    }
  }

  handleChange (id) {
    return () => {
      this.setState({ selected: id, changed: true })
      this.props.onChange(id)
    }
  }

  render () {
    let { items, idPrefix } = this.props

    items = checkItems(items)

    let idCounter = 0
    return (
      <div style={{ width: '100%' }}>
        <div className='dropdown'>
          <button className={`btn btn-default dropdown-toggle ${style['dropdown-button']}`} type='button' data-toggle='dropdown' id={`${idPrefix}-button-toggle`}>
            <span className={style['dropdown-button-text']} id={`${idPrefix}-button-text`}>{items[this.state.selected] ? items[this.state.selected].value : Object.values(items)[0].value}</span>
            <span className='caret' id={`${idPrefix}-button-caret`} />
          </button>
          <ul className={`dropdown-menu ${style['dropdown']}`} role='menu'>
            {Object.values(items).map(item => (
              <li role='presentation' className={item.id === this.state.selected ? 'selected' : ''} key={item.id}>
                <a role='menuitem' tabIndex='-1' onClick={this.handleChange(item.id)} id={`${idPrefix}-${idCounter++}`}>
                  {item.value}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>)
  }
}

SelectBox.propTypes = {
  selected: PropTypes.string.isRequired,
  items: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
  idPrefix: PropTypes.string.isRequired,
}

export default SelectBox
