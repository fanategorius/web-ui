import React, { useContext, useEffect } from 'react'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'
import { MsgContext } from '_/intl'
import { getByPage } from '_/actions'
import {
  filterVms,
  sortFunction,
  SortFields,
  ICON,
  POOL_INFO,
  ACTIONS,
  NAME,
  OS,
  STATUS,
} from '_/utils'

import useInfiniteScroll from '@closeio/use-infinite-scroll'
import {
  CardVm,
  TableVm,
} from './Vm'
import {
  CardPool,
  TablePool,
} from './Pool'

import style from './style.css'
import { Gallery, GalleryItem } from '@patternfly/react-core'
import TableView from './TableView'

/**
 * Use Patternfly 'Single Select Card View' pattern to show every VM and Pool
 * available to the current user.
 *
 * NOTE: It is important that the first page of VMs & Pools has already been loaded
 * before this component is rendered.  This will prevent two "initial page" fetches
 * from running at the same time.  The `VmsList` component handles this normally.
 */
const VmCardList = ({ vms, alwaysShowPoolCard, fetchMoreVmsAndPools, tableView }) => {
  const { msg, locale } = useContext(MsgContext)
  const sort = vms.get('sort').toJS()
  const filters = vms.get('filters').toJS()

  // Filter the VMs (1. apply the filter bar criteria, 2. only show Pool VMs if the Pool exists)
  const filteredVms = vms.get('vms')
    .filter(vm => filterVms(vm, filters))
    .filter(vm => vm.getIn(['pool', 'id'], false) ? !!vms.getIn(['pools', vm.getIn(['pool', 'id'])], false) : true)
    .toList()
    .map(vm => vm.set('isVm', true))

  // Filter the Pools (only show a Pool card if the user can currently 'Take' a VM from it)
  const filteredPools = vms.get('pools')
    .filter(pool =>
      (alwaysShowPoolCard || (pool.get('vmsCount') < pool.get('maxUserVms') && pool.get('size') > 0)) &&
      filterVms(pool, filters)
    )
    .toList()

  // Display the VMs and Pools together, sorted nicely
  const vmsAndPools = [...filteredVms, ...filteredPools].sort(sortFunction(sort, locale, msg))

  // Handle the infinite scroll and pagination
  const hasMore = vms.get('vmsExpectMorePages') || vms.get('poolsExpectMorePages')
  const [page, sentinelRef, scrollerRef] = useInfiniteScroll({ hasMore, distance: 0 })

  useEffect(() => { // `VmsList` will not display this component until the first page of data is loaded
    if (page > 0) {
      fetchMoreVmsAndPools()
    }
  }, [page, fetchMoreVmsAndPools])

  useEffect(() => {
    if (!scrollerRef.current || !sentinelRef.current) {
      return
    }

    //
    // If a page fetch doesn't pull enough entities to push the sentinel out of view
    // underlying IntersectionObserver doesn't fire another event, and the scroller
    // gets stuck.  Manually check if the sentinel is in view, and if it is, fetch
    // more data.  The effect is only run when the `vms` part of the redux store is
    // updated.
    //
    const scrollRect = scrollerRef.current.getBoundingClientRect()
    const scrollVisibleTop = scrollRect.y
    const scrollVisibleBottom = scrollRect.y + scrollRect.height

    const sentinelRect = sentinelRef.current.getBoundingClientRect()
    const sentinelTop = sentinelRect.y
    const sentinelBottom = sentinelRect.y + sentinelRect.height

    const sentinelStillInView = sentinelBottom >= scrollVisibleTop && sentinelTop <= scrollVisibleBottom
    if (sentinelStillInView) {
      fetchMoreVmsAndPools()
    }
  }, [vms, scrollerRef, sentinelRef, fetchMoreVmsAndPools])

  const columnList = [
    { id: ICON },
    {
      ...SortFields[NAME],
      sort: true,
    },
    {
      ...SortFields[STATUS],
      sort: true,
    },
    { id: POOL_INFO },
    {
      ...SortFields[OS],
      sort: true,
    },
    { id: ACTIONS },
  ]

  return (
    <div ref={scrollerRef} className={tableView ? style.tableView : ''}>
      { !tableView && (
        <Gallery hasGutter className={style['gallery-container']}>
          {vmsAndPools.map(entity => (
            <GalleryItem key={entity.get('id')}>{
            entity.get('isVm')
              ? <CardVm vm={entity} />
              : <CardPool pool={entity} />}
            </GalleryItem>
          ))}
        </Gallery>
      )}
      {tableView && (
        <TableView
          columns={columnList}
          sort={sort}
        >
          { vmsAndPools.map(entity => (
            entity.get('isVm')
              ? (
                <TableVm
                  columns={columnList}
                  key={entity.get('id')}
                  vm={entity}
                />
              )
              : (
                <TablePool
                  columns={columnList}
                  key={entity.get('id')}
                  pool={entity}
                />
              )
          ))}
        </TableView>
      )}
      {hasMore && <div ref={sentinelRef} className={style['infinite-scroll-sentinel']}>{msg.loadingTripleDot()}</div>}
    </div>
  )
}
VmCardList.propTypes = {
  tableView: PropTypes.bool.isRequired,
  vms: PropTypes.object.isRequired,
  alwaysShowPoolCard: PropTypes.bool,
  fetchMoreVmsAndPools: PropTypes.func.isRequired,
}

export default connect(
  ({ vms, config, options }) => ({
    vms,
    alwaysShowPoolCard: !config.get('filter'),
    tableView: options.getIn(['remoteOptions', 'viewForVirtualMachines', 'content']) === 'table',
  }),
  (dispatch) => ({
    fetchMoreVmsAndPools: () => dispatch(getByPage()),
  })
)(VmCardList)
