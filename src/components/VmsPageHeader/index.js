import React from 'react'
import PropTypes from 'prop-types'

import { connect } from 'react-redux'

import VmUserMessages from '../VmUserMessages'
import UserMenu from './UserMenu'
import { hrefWithoutHistory } from '../../helpers'

import { refresh } from '../../actions/vm'

/**
 * Main application header on top of the page
 */
const VmsPageHeader = ({ onRefresh }) => {
  return (
    <nav className='navbar obrand_mastheadBackground obrand_topBorder navbar-pf-vertical'>
      <div className='navbar-header'>
        <button type='button' className='navbar-toggle' data-toggle='collapse'>
          <span className='icon-bar' />
          <span className='icon-bar' />
          <span className='icon-bar' />
        </button>
        <a href='#' className='navbar-brand obrand_headerLogoLink'>
          <img className='obrand_mastheadLogo' src='../branding/images/clear.cache.gif' />
        </a>
      </div>

      <div className='collapse navbar-collapse'>
        <ul className='nav navbar-nav navbar-right navbar-iconic'>
          <li>
            <a href='#' className='nav-item-iconic' onClick={hrefWithoutHistory(onRefresh)}>
              <i className='fa fa-refresh' />
            </a>
          </li>

          <UserMenu />
          <VmUserMessages />
        </ul>
      </div>

    </nav>
  )
}
VmsPageHeader.propTypes = {
  page: PropTypes.number.isRequired,
  onRefresh: PropTypes.func.isRequired,
}

export default connect(
  (state) => ({ }),
  (dispatch, { page }) => ({
    onRefresh: () => dispatch(refresh({ quiet: false, shallowFetch: false, page })),
  })
)(VmsPageHeader)
