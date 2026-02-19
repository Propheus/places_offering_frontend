import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import './App.css'
import logoSrc from './assets/propheus.png'
import alfamartLogo from './assets/alfamartlogo.png'
import Supercluster from 'supercluster'
import { loadStoresFromCSV, type Store } from './utils/csvParser'

function App() {
  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const clusterRef = useRef<Supercluster<Store, Store> | null>(null)
  const filteredClusterRef = useRef<Supercluster<Store, Store> | null>(null)
  const clusterMarkersRef = useRef<Map<string | number, mapboxgl.Marker>>(new Map())
  const filteredStoresRef = useRef<Store[]>([])
  const selectedStoreRef = useRef<Store | null>(null)
  const updateClustersRef = useRef<() => void>(() => {})

  const [query, setQuery] = useState('')
  const [filterType, setFilterType] = useState<'name_address' | 'location_type' | 'store_size' | 'parking' | 'expenditure'>('name_address')
  const [stores, setStores] = useState<Store[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedStore, setSelectedStore] = useState<Store | null>(null)

  // Update ref whenever selectedStore changes
  useEffect(() => {
    selectedStoreRef.current = selectedStore
  }, [selectedStore])

  // Load stores from CSV on mount
  useEffect(() => {
    const loadStores = async () => {
      setIsLoading(true)
      const loadedStores = await loadStoresFromCSV()
      setStores(loadedStores)
      setIsLoading(false)
    }

    loadStores()
  }, [])

  // Initialize clustering
  useEffect(() => {
    if (stores.length === 0) return

    const cluster = new Supercluster<Store, Store>({
      radius: 60,
      maxZoom: 16,
      minZoom: 0,
    })

    const points = stores.map((store) => ({
      type: 'Feature' as const,
      properties: store,
      geometry: {
        type: 'Point' as const,
        coordinates: [store.google_lon, store.google_lat],
      },
    }))

    cluster.load(points)
    clusterRef.current = cluster
  }, [stores])

  // Filter stores based on search query
  const filteredStores = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return stores
    
    if (filterType === 'name_address') {
      // Create a regex for word boundary matching
      const wordBoundaryRegex = new RegExp(`\\b${normalizedQuery}`, 'i')
      return stores.filter((store) =>
        wordBoundaryRegex.test(store.name) ||
        wordBoundaryRegex.test(store.address)
      )
    } else if (filterType === 'location_type') {
      return stores.filter((store) =>
        store.location_type?.toLowerCase().includes(normalizedQuery)
      )
    } else if (filterType === 'store_size') {
      return stores.filter((store) =>
        store.store_size?.toLowerCase().includes(normalizedQuery)
      )
    } else if (filterType === 'parking') {
      return stores.filter((store) =>
        store.parking?.toLowerCase().includes(normalizedQuery)
      )
    } else if (filterType === 'expenditure') {
      return stores.filter((store) =>
        store.expenditure_band?.toLowerCase().includes(normalizedQuery)
      )
    }
    
    return stores
  }, [stores, query, filterType])

  // Update ref whenever filteredStores changes
  useEffect(() => {
    filteredStoresRef.current = filteredStores
  }, [filteredStores])

  // Create filtered cluster index
  useEffect(() => {
    if (filteredStores.length === 0) {
      filteredClusterRef.current = null
      return
    }

    const cluster = new Supercluster<Store, Store>({
      radius: 60,
      maxZoom: 16,
      minZoom: 0,
    })

    const points = filteredStores.map((store) => ({
      type: 'Feature' as const,
      properties: store,
      geometry: {
        type: 'Point' as const,
        coordinates: [store.google_lon, store.google_lat],
      },
    }))

    cluster.load(points)
    filteredClusterRef.current = cluster
  }, [filteredStores])

  // Helper function to show store marker
  const showStoreMarker = useCallback((store: Store, coords: [number, number], markerId: string) => {
    const map = mapRef.current
    if (!map) return

    const markerEl = document.createElement('div')
    markerEl.className = 'map-marker'

    const marker = new mapboxgl.Marker({ element: markerEl })
      .setLngLat(coords)
      .addTo(map)

    // Click marker to select store
    markerEl.addEventListener('click', () => {
      setSelectedStore(store)
    })

    clusterMarkersRef.current.set(markerId, marker)
  }, [])

  // Update clusters based on zoom level and bounds
  const updateClusters = useCallback(() => {
    const map = mapRef.current
    // Use filtered cluster if search is active, otherwise use all stores
    const activeCluster = filteredClusterRef.current || clusterRef.current
    if (!map || !activeCluster) return

    // Don't update clusters if a store is selected
    if (selectedStoreRef.current) return

    // Remove old cluster markers first
    clusterMarkersRef.current.forEach((marker) => marker.remove())
    clusterMarkersRef.current.clear()

    // If no filtered stores, don't render any markers
    if (filteredStoresRef.current.length === 0) return

    const zoom = map.getZoom()
    const bounds = map.getBounds()
    if (!bounds) return
    
    const bbox: [number, number, number, number] = [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ]

    // Get clusters and points for current view
    const clusters = activeCluster.getClusters(bbox, Math.floor(zoom))

    // Add new cluster and point markers
    clusters.forEach((cluster) => {
      const coords = cluster.geometry.coordinates as [number, number]
      const props = cluster.properties as Store & { point_count?: number; cluster?: boolean }
      const count = props.point_count || 0
      const clusterId = cluster.id as number

      // Only show cluster marker if more than 8 stores
      if (props.cluster && count > 8) {
        const markerEl = document.createElement('div')
        markerEl.className = 'cluster-marker'
        markerEl.innerHTML = `<div>${count}</div>`

        const marker = new mapboxgl.Marker({ element: markerEl })
          .setLngLat(coords)
          .addTo(map)

        // Zoom to cluster on click
        markerEl.addEventListener('click', () => {
          const expansionZoom = activeCluster.getClusterExpansionZoom(clusterId)
          if (expansionZoom !== undefined) {
            map.flyTo({
              center: coords,
              zoom: expansionZoom,
              duration: 500,
            })
          }
        })

        clusterMarkersRef.current.set(clusterId, marker)
      } else if (props.cluster && count <= 8) {
        // Expand cluster with 8 or fewer stores to show all individual markers
        const expandCluster = (cId: number) => {
          const children = activeCluster.getChildren(cId)
          children.forEach((child) => {
            const childProps = child.properties as Store & { cluster?: boolean }
            if (childProps.cluster) {
              // Recursively expand sub-clusters
              expandCluster(child.id as number)
            } else {
              // Individual store
              const store = child.properties as Store
              const storeCoords = child.geometry.coordinates as [number, number]
              showStoreMarker(store, storeCoords, `${store.id}-${Math.random()}`)
            }
          })
        }
        expandCluster(clusterId)
      } else {
        // Individual store point
        const store = cluster.properties as Store
        const storeCoords = cluster.geometry.coordinates as [number, number]
        showStoreMarker(store, storeCoords, `${store.id}`)
      }
    })
  }, [showStoreMarker])

  useEffect(() => {
    updateClustersRef.current = updateClusters
  }, [updateClusters])

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current || !mapboxToken) {
      return
    }

    mapboxgl.accessToken = mapboxToken
    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [106.8456, -6.2088], // Center of Jakarta/Indonesia
      zoom: 11,
      attributionControl: false,
      projection: 'mercator',
    })

    const handleMapUpdate = () => {
      updateClustersRef.current()
    }

    // Listen to map movement and update clusters
    mapRef.current.on('move', handleMapUpdate)
    mapRef.current.on('moveend', handleMapUpdate)

    return () => {
      mapRef.current?.off('move', handleMapUpdate)
      mapRef.current?.off('moveend', handleMapUpdate)
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [mapboxToken])

  // Update clusters when filtered stores change
  useEffect(() => {
    updateClusters()
  }, [filteredStores, updateClusters])

  // Handle store selection - zoom to store and show only its marker
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (selectedStore) {
      // Clear all existing markers
      clusterMarkersRef.current.forEach((marker) => marker.remove())
      clusterMarkersRef.current.clear()

      // Zoom to the selected store
      map.flyTo({
        center: [selectedStore.google_lon, selectedStore.google_lat],
        zoom: 16,
        duration: 1000,
      })

      // Show only the selected store marker
      showStoreMarker(
        selectedStore,
        [selectedStore.google_lon, selectedStore.google_lat],
        `selected-${selectedStore.id}`
      )
    } else {
      // When store is deselected, restore normal clustering
      updateClusters()
    }
  }, [selectedStore, showStoreMarker, updateClusters])

  return (
    <div className={`app-shell ${selectedStore ? 'with-right-sidebar' : ''}`}>
      <main className="map-panel">
        <header className="top-bar">
          <img src={logoSrc} className="top-bar-logo" alt="logo" />
          <div className="search-wrapper">
            <div className="search-input">
              <span className="search-icon" />
              <select 
                className="filter-type-dropdown"
                value={filterType}
                onChange={(e) => {
                  setFilterType(e.target.value as typeof filterType)
                  setQuery('')
                }}
              >
                <option value="name_address">Name & Address</option>
                <option value="location_type">Location Type</option>
                <option value="store_size">Store Size</option>
                <option value="parking">Parking</option>
                <option value="expenditure">Expenditure</option>
              </select>
              <input
                placeholder={
                  filterType === 'name_address' ? 'Search by store name or address...' :
                  filterType === 'location_type' ? 'Search by location type...' :
                  filterType === 'store_size' ? 'Search by store size...' :
                  filterType === 'parking' ? 'Search by parking availability...' :
                  'Search by expenditure...'
                }
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </div>
          <div className="top-actions">
            <button className="icon-button" aria-label="Notifications">
              <span className="bell-icon" />
            </button>
            <div className="avatar" />
          </div>
        </header>

        {!mapboxToken && (
          <div className="map-token-warning">
            <h2>Add your Mapbox token</h2>
            <p>
              Set <strong>VITE_MAPBOX_TOKEN</strong> in a .env file to load the
              map.
            </p>
          </div>
        )}

        {isLoading && (
          <div className="map-token-warning">
            <h2>Loading stores...</h2>
            <p>Please wait while we load the store data.</p>
          </div>
        )}

        {filteredStores.length === 0 && query.trim() !== '' && (
          <div className="no-results-message">
            No stores matched the criteria
          </div>
        )}

        <div ref={mapContainerRef} className="map-container" />

        <div className="summary-card">
          <p className="summary-card__title">Cluster summary</p>
          <div className="summary-card__row">
            <span>Visible Stores:</span>
            <strong>{filteredStores.length > 0 ? filteredStores.length.toLocaleString() : '0'}</strong>
          </div>
          <div className="summary-card__row">
            <span>Total Stores:</span>
            <strong>{stores.length.toLocaleString()}</strong>
          </div>
        </div>
      </main>

      {selectedStore && (
        <aside className="sidebar-right">
          <div className="sidebar-right-header">
            <button
              className="close-button"
              onClick={() => setSelectedStore(null)}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div className="sidebar-right-content">
            <div className="store-header">
              <div className="store-badge">
                <img src={alfamartLogo} alt="Alfamart" className="store-badge-logo" />
              </div>
              <div>
                <h2>{selectedStore.name}</h2>
                <p className="store-location">{selectedStore.address}</p>
              </div>
            </div>

            <div className="store-section">
              <h3>Store Information</h3>
              <div className="store-grid">
                <div className="store-item">
                  <label>Brand</label>
                  <span>Alfamart</span>
                </div>
                <div className="store-item">
                  <label>Store Size</label>
                  <span>{selectedStore.store_size || 'N/A'}</span>
                </div>
                <div className="store-item">
                  <label>Parking</label>
                  <span>{selectedStore.parking || 'N/A'}</span>
                </div>
              </div>
            </div>

            <div className="store-section">
              <h3>Demographics</h3>
              <div className="store-grid">
                <div className="store-item">
                  <label>Location Type</label>
                  <span>{selectedStore.location_type || 'N/A'}</span>
                </div>
                <div className="store-item">
                  <label>Population Total</label>
                  <span>{selectedStore.T_TL ? selectedStore.T_TL.toLocaleString() : 'N/A'}</span>
                </div>
                <div className="store-item">
                  <label>Expenditure</label>
                  <span>{selectedStore.expenditure_band || 'N/A'}</span>
                </div>
                {selectedStore.phone && (
                  <div className="store-item">
                    <label>Phone</label>
                    <span>{selectedStore.phone}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>
      )}
    </div>
  )
}

export default App
