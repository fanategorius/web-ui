// @flow

import AppConfiguration from './config'

let loaded: ?Promise<void>

function getBrandedResourceUrl (resourceId: string): string {
  const separator = AppConfiguration.applicationURL.endsWith('/')
      ? ''
      : '/'
  return `${AppConfiguration.applicationURL}${separator}branding/${resourceId}`
}

export const resourcesUrls = {
  get favicon (): string { return getBrandedResourceUrl('favicon.ico?v=2') },
  get baseStylesheet (): string { return getBrandedResourceUrl('style.css') },
  get ovirtBrandStylesheet (): string { return getBrandedResourceUrl('ovirt-brand.css') },
  get fixedStrings (): string { return getBrandedResourceUrl('fixed-strings.json') },
}

export function loadOnce (): Promise<void> {
  if (!loaded) {
    loaded = fetch(resourcesUrls.fixedStrings)
      .then(body => body.json())
      .then(json => {
        fixedStrings = Object.freeze(json)
      })
      .catch(error => console.error(`'${resourcesUrls.fixedStrings}' cannot be loaded.`, error))
  }
  return loaded
}

export let fixedStrings: {|
  BRAND_NAME: string,
  LEGAL_INFO: string,
  LEGAL_INFO_LINK_TEXT: string,
  LEGAL_INFO_LINK_URL: string
|}
