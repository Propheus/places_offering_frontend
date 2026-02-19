import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import './App.css'
import logoSrc from './assets/propheus.png'
import alfamartLogo from './assets/alfamartlogo.png'
import Supercluster from 'supercluster'
import { loadStoresFromCSV, type Store } from './utils/csvParser'

type SimilarStore = {
  id: string
  name: string
  address: string
  lat: number
  lon: number
}

type NearbyPlace = {
  id: string
  name: string
  address: string
  top_category: string
  lat: number
  lon: number
}

type NearbyAlfamartsResponse = {
  stores: SimilarStore[]
  count: number
}

type NearbyPlacesResponse = {
  stores: NearbyPlace[]
  counts: Record<string, number>
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://10.0.2.45:8000'
const POI_CONNECTION_SOURCE_ID = 'poi-connections-source'
const POI_CONNECTION_LAYER_ID = 'poi-connections-layer'
const AGE_LABELS = [
  '00-04',
  '05-09',
  '10-14',
  '15-19',
  '20-24',
  '25-29',
  '30-34',
  '35-39',
  '40-44',
  '45-49',
  '50-54',
  '55-59',
  '60-64',
  '65-69',
  '70-74',
  '75Plus',
]
const MALE_AGE_COLORS = [
  '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a', '#1f4aa8',
  '#14b8a6', '#0ea5a4', '#0f766e', '#0f766e', '#1f6f78', '#a78bfa', '#8b5cf6', '#6d28d9',
]
const FEMALE_AGE_COLORS = [
  '#fbcfe8', '#f9a8d4', '#f472b6', '#ec4899', '#db2777', '#be185d', '#fda4af', '#fb7185',
  '#fb4f6d', '#f43f5e', '#e11d48', '#be123c', '#9d174d', '#d946ef', '#c026d3', '#a21caf',
]

function buildDonutGradient(values: number[], colors: string[]) {
  const normalizedValues = values.map((value) =>
    Number.isFinite(value) && value > 0 ? value : 0,
  )
  const total = normalizedValues.reduce((sum, value) => sum + value, 0)
  if (total <= 0) {
    return '#2f2b27'
  }

  const gapPct = 0.22
  let current = 0
  const segments = normalizedValues.map((value, index) => {
    const start = current
    const pct = (value / total) * 100
    current += pct
    const end = current
    const sliceGap = Math.min(gapPct, Math.max(0, pct * 0.28))
    const paintedEnd = Math.max(start, end - sliceGap)
    return `${colors[index]} ${start}% ${paintedEnd}%, #1f1c19 ${paintedEnd}% ${end}%`
  })

  return `conic-gradient(${segments.join(', ')})`
}

function App() {
  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const clusterRef = useRef<Supercluster<Store, Store> | null>(null)
  const filteredClusterRef = useRef<Supercluster<Store, Store> | null>(null)
  const clusterMarkersRef = useRef<Map<string | number, mapboxgl.Marker>>(new Map())
  const poiMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map())
  const filteredStoresRef = useRef<Store[]>([])
  const selectedStoreRef = useRef<Store | null>(null)
  const updateClustersRef = useRef<() => void>(() => {})

  const [query, setQuery] = useState('')
  const [filterType, setFilterType] = useState<'name_address' | 'location_type' | 'store_size' | 'parking' | 'expenditure'>('name_address')
  const [stores, setStores] = useState<Store[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedStore, setSelectedStore] = useState<Store | null>(null)
  const [sidebarTab, setSidebarTab] = useState<'description' | 'demographics' | 'similar' | 'nearby'>('description')
  const [similarStores, setSimilarStores] = useState<SimilarStore[]>([])
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlace[]>([])
  const [nearbyCounts, setNearbyCounts] = useState<Record<string, number>>({})
  const [nearbyLoading, setNearbyLoading] = useState(false)
  const [nearbyError, setNearbyError] = useState<string | null>(null)
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null)
  const [hoveredMaleAgeIndex, setHoveredMaleAgeIndex] = useState<number | null>(null)
  const [hoveredFemaleAgeIndex, setHoveredFemaleAgeIndex] = useState<number | null>(null)

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

  const clearPoiMarkers = useCallback(() => {
    poiMarkersRef.current.forEach((marker) => marker.remove())
    poiMarkersRef.current.clear()
  }, [])

  const clearPoiConnections = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    if (map.getLayer(POI_CONNECTION_LAYER_ID)) {
      map.removeLayer(POI_CONNECTION_LAYER_ID)
    }
    if (map.getSource(POI_CONNECTION_SOURCE_ID)) {
      map.removeSource(POI_CONNECTION_SOURCE_ID)
    }
  }, [])

  const categoryEntries = useMemo(
    () => Object.entries(nearbyCounts).sort((a, b) => b[1] - a[1]),
    [nearbyCounts],
  )
  const maxCategoryCount = categoryEntries[0]?.[1] || 1
  const hasDemographics = (selectedStore?.T_TL || 0) > 0
  const malePopulation = selectedStore?.M_TL || 0
  const femalePopulation = selectedStore?.F_TL || 0
  const genderTotal = malePopulation + femalePopulation
  const malePct = genderTotal > 0 ? (malePopulation / genderTotal) * 100 : 0
  const femalePct = genderTotal > 0 ? (femalePopulation / genderTotal) * 100 : 0
  const maleAgeValues = selectedStore
    ? [
        Number(selectedStore.M_00_04) || 0,
        Number(selectedStore.M_05_09) || 0,
        Number(selectedStore.M_10_14) || 0,
        Number(selectedStore.M_15_19) || 0,
        Number(selectedStore.M_20_24) || 0,
        Number(selectedStore.M_25_29) || 0,
        Number(selectedStore.M_30_34) || 0,
        Number(selectedStore.M_35_39) || 0,
        Number(selectedStore.M_40_44) || 0,
        Number(selectedStore.M_45_49) || 0,
        Number(selectedStore.M_50_54) || 0,
        Number(selectedStore.M_55_59) || 0,
        Number(selectedStore.M_60_64) || 0,
        Number(selectedStore.M_65_69) || 0,
        Number(selectedStore.M_70_74) || 0,
        Number(selectedStore.M_75Plus) || 0,
      ]
    : Array(16).fill(0)
  const femaleAgeValues = selectedStore
    ? [
        Number(selectedStore.F_00_04) || 0,
        Number(selectedStore.F_05_09) || 0,
        Number(selectedStore.F_10_14) || 0,
        Number(selectedStore.F_15_19) || 0,
        Number(selectedStore.F_20_24) || 0,
        Number(selectedStore.F_25_29) || 0,
        Number(selectedStore.F_30_34) || 0,
        Number(selectedStore.F_35_39) || 0,
        Number(selectedStore.F_40_44) || 0,
        Number(selectedStore.F_45_49) || 0,
        Number(selectedStore.F_50_54) || 0,
        Number(selectedStore.F_55_59) || 0,
        Number(selectedStore.F_60_64) || 0,
        Number(selectedStore.F_65_69) || 0,
        Number(selectedStore.F_70_74) || 0,
        Number(selectedStore.F_75Plus) || 0,
      ]
    : Array(16).fill(0)
  const maleAgeTotal = maleAgeValues.reduce((sum, value) => sum + value, 0)
  const femaleAgeTotal = femaleAgeValues.reduce((sum, value) => sum + value, 0)
  const maleAgePercentages = maleAgeValues.map((value) =>
    maleAgeTotal > 0 ? (value / maleAgeTotal) * 100 : 0,
  )
  const femaleAgePercentages = femaleAgeValues.map((value) =>
    femaleAgeTotal > 0 ? (value / femaleAgeTotal) * 100 : 0,
  )
  const maleAgeBackground = buildDonutGradient(maleAgeValues, MALE_AGE_COLORS)
  const femaleAgeBackground = buildDonutGradient(femaleAgeValues, FEMALE_AGE_COLORS)

  const handleSimilarStoreSelect = useCallback(
    (similarStore: SimilarStore) => {
      const matchedStore = stores.find((s) => s.id === similarStore.id)

      if (matchedStore) {
        setSelectedStore(matchedStore)
        return
      }

      setSelectedStore({
        id: similarStore.id,
        google_lat: similarStore.lat,
        google_lon: similarStore.lon,
        name: similarStore.name,
        category: 'Convenience store',
        address: similarStore.address,
        phone: '',
        rating: 0,
        location_type: '',
        parking: '',
        store_size: '',
        T_TL: 0,
        M_TL: 0,
        F_TL: 0,
        M_00_04: 0,
        M_05_09: 0,
        M_10_14: 0,
        M_15_19: 0,
        M_20_24: 0,
        M_25_29: 0,
        M_30_34: 0,
        M_35_39: 0,
        M_40_44: 0,
        M_45_49: 0,
        M_50_54: 0,
        M_55_59: 0,
        M_60_64: 0,
        M_65_69: 0,
        M_70_74: 0,
        M_75Plus: 0,
        F_00_04: 0,
        F_05_09: 0,
        F_10_14: 0,
        F_15_19: 0,
        F_20_24: 0,
        F_25_29: 0,
        F_30_34: 0,
        F_35_39: 0,
        F_40_44: 0,
        F_45_49: 0,
        F_50_54: 0,
        F_55_59: 0,
        F_60_64: 0,
        F_65_69: 0,
        F_70_74: 0,
        F_75Plus: 0,
        expenditure_band: '',
      })
    },
    [stores],
  )

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
  const showStoreMarker = useCallback((store: Store, coords: [number, number], markerId: string, isSelectedStore = false) => {
    const map = mapRef.current
    if (!map) return

    const markerEl = document.createElement('div')
    markerEl.className = isSelectedStore
      ? 'map-marker map-marker--selected-store'
      : 'map-marker'

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
    if (!hasDemographics && sidebarTab === 'demographics') {
      setSidebarTab('description')
    }
  }, [hasDemographics, sidebarTab])

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
        `selected-${selectedStore.id}`,
        true,
      )
    } else {
      // When store is deselected, restore normal clustering
      updateClusters()
      clearPoiMarkers()
      clearPoiConnections()
    }
  }, [selectedStore, showStoreMarker, updateClusters, clearPoiMarkers, clearPoiConnections])

  // Fetch nearby similar stores and places when selected store changes
  useEffect(() => {
    if (!selectedStore) {
      setSimilarStores([])
      setNearbyPlaces([])
      setNearbyCounts({})
      setNearbyError(null)
      setNearbyLoading(false)
      setSelectedPoiId(null)
      clearPoiMarkers()
      clearPoiConnections()
      return
    }

    const controller = new AbortController()

    const fetchNearbyData = async () => {
      try {
        setNearbyLoading(true)
        setNearbyError(null)
        setSidebarTab('description')
        setSelectedPoiId(null)
        clearPoiMarkers()
        clearPoiConnections()

        const storeId = encodeURIComponent(selectedStore.id)
        const [similarResponse, placesResponse] = await Promise.all([
          fetch(
            `${API_BASE_URL}/nearby_alfamarts?id=${storeId}&radius_m=1000`,
            {
              signal: controller.signal,
              headers: { accept: 'application/json' },
            },
          ),
          fetch(`${API_BASE_URL}/nearby_places?id=${storeId}&radius_m=250`, {
            signal: controller.signal,
            headers: { accept: 'application/json' },
          }),
        ])

        if (!similarResponse.ok || !placesResponse.ok) {
          throw new Error('Failed to fetch nearby data')
        }

        const similarData =
          (await similarResponse.json()) as NearbyAlfamartsResponse
        const placesData = (await placesResponse.json()) as NearbyPlacesResponse

        setSimilarStores(similarData.stores || [])
        setNearbyPlaces(placesData.stores || [])
        setNearbyCounts(placesData.counts || {})
      } catch (error) {
        if ((error as Error).name === 'AbortError') return

        setSimilarStores([])
        setNearbyPlaces([])
        setNearbyCounts({})
        setNearbyError('Failed to load nearby store data')
      } finally {
        if (!controller.signal.aborted) {
          setNearbyLoading(false)
        }
      }
    }

    fetchNearbyData()

    return () => {
      controller.abort()
    }
  }, [selectedStore, clearPoiMarkers, clearPoiConnections])

  // Render nearby POI markers on map when nearby tab is active
  useEffect(() => {
    const map = mapRef.current
    if (!map || !selectedStore || sidebarTab !== 'nearby') {
      clearPoiMarkers()
      return
    }

    clearPoiMarkers()

    nearbyPlaces.forEach((place) => {
      const markerEl = document.createElement('div')
      markerEl.className =
        selectedPoiId === place.id ? 'poi-marker poi-marker--active' : 'poi-marker'
      markerEl.title = place.name

      markerEl.addEventListener('click', () => {
        setSelectedPoiId(place.id)
        map.flyTo({
          center: [place.lon, place.lat],
          zoom: Math.max(map.getZoom(), 16),
          duration: 600,
        })
      })

      const marker = new mapboxgl.Marker({ element: markerEl })
        .setLngLat([place.lon, place.lat])
        .addTo(map)

      poiMarkersRef.current.set(place.id, marker)
    })

    return () => {
      clearPoiMarkers()
    }
  }, [sidebarTab, nearbyPlaces, selectedPoiId, selectedStore, clearPoiMarkers])

  // Render connection lines from selected Alfamart to nearby POIs
  useEffect(() => {
    const map = mapRef.current
    if (!map || !selectedStore || sidebarTab !== 'nearby' || nearbyPlaces.length === 0) {
      clearPoiConnections()
      return
    }

    const lineGeoJson: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
      type: 'FeatureCollection',
      features: nearbyPlaces.map((place) => ({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [selectedStore.google_lon, selectedStore.google_lat],
            [place.lon, place.lat],
          ],
        },
        properties: {
          id: place.id,
        },
      })),
    }

    const existingSource = map.getSource(POI_CONNECTION_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined

    if (existingSource) {
      existingSource.setData(lineGeoJson)
    } else {
      map.addSource(POI_CONNECTION_SOURCE_ID, {
        type: 'geojson',
        data: lineGeoJson,
      })

      map.addLayer({
        id: POI_CONNECTION_LAYER_ID,
        type: 'line',
        source: POI_CONNECTION_SOURCE_ID,
        paint: {
          'line-color': '#ff6b6b',
          'line-width': 1.6,
          'line-opacity': 0.55,
          'line-dasharray': [1.2, 1.2],
        },
      })
    }

    return () => {
      clearPoiConnections()
    }
  }, [sidebarTab, nearbyPlaces, selectedStore, clearPoiConnections])

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

            <div className="sidebar-tabs">
              <button
                className={`sidebar-tab ${sidebarTab === 'description' ? 'active' : ''}`}
                onClick={() => setSidebarTab('description')}
              >
                Description
              </button>
              {hasDemographics && (
                <button
                  className={`sidebar-tab ${sidebarTab === 'demographics' ? 'active' : ''}`}
                  onClick={() => setSidebarTab('demographics')}
                >
                  Demographics
                </button>
              )}
              <button
                className={`sidebar-tab ${sidebarTab === 'similar' ? 'active' : ''}`}
                onClick={() => setSidebarTab('similar')}
              >
                Similar Stores
              </button>
              <button
                className={`sidebar-tab ${sidebarTab === 'nearby' ? 'active' : ''}`}
                onClick={() => setSidebarTab('nearby')}
              >
                Nearby Places
              </button>
            </div>

            {sidebarTab === 'description' && (
              <div className="tab-content">
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
            )}

            {sidebarTab === 'demographics' && (
              <div className="tab-content">
                <div className="store-section">
                  <h3>Distribution Split</h3>
                  <div className="demographics-split-card">
                    <div
                      className="gender-pie"
                      style={{
                        background: `conic-gradient(#3b82f6 0% ${malePct}%, #ec4899 ${malePct}% 100%)`,
                      }}
                    >
                      <div className="gender-pie__inner">{genderTotal > 0 ? 'F/M' : 'N/A'}</div>
                    </div>

                    <div className="gender-legend">
                      <div className="gender-legend__item">
                        <span className="gender-dot gender-dot--male" />
                        <div>
                          <div className="gender-legend__title">Male (M_TL)</div>
                          <div className="gender-legend__value">
                            {malePopulation.toLocaleString()} ({malePct.toFixed(1)}%)
                          </div>
                        </div>
                      </div>
                      <div className="gender-legend__item">
                        <span className="gender-dot gender-dot--female" />
                        <div>
                          <div className="gender-legend__title">Female (F_TL)</div>
                          <div className="gender-legend__value">
                            {femalePopulation.toLocaleString()} ({femalePct.toFixed(1)}%)
                          </div>
                        </div>
                      </div>
                      <div className="gender-total">Total: {genderTotal.toLocaleString()}</div>
                    </div>
                  </div>
                </div>

                <div className="age-distribution-grid">
                  <div className="age-card age-card--male">
                    <h4>Male Age Distribution</h4>
                    <div className="age-donut" style={{ background: maleAgeBackground }}>
                      <div className="age-donut__inner">
                        {hoveredMaleAgeIndex !== null ? (
                          <>
                            <span className="age-donut__label">{AGE_LABELS[hoveredMaleAgeIndex]}</span>
                            <span className="age-donut__value">
                              {maleAgePercentages[hoveredMaleAgeIndex].toFixed(1)}%
                            </span>
                          </>
                        ) : (
                          <span className="age-donut__hint">Hover</span>
                        )}
                      </div>
                    </div>
                    <div className="age-legend-grid">
                      {AGE_LABELS.map((label, index) => (
                        <div
                          className={`age-legend-item ${hoveredMaleAgeIndex === index ? 'active' : ''}`}
                          key={`male-${label}`}
                          onMouseEnter={() => setHoveredMaleAgeIndex(index)}
                          onMouseLeave={() => setHoveredMaleAgeIndex(null)}
                        >
                          <span
                            className="age-legend-dot"
                            style={{ background: MALE_AGE_COLORS[index] }}
                          />
                          <span>{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="age-card age-card--female">
                    <h4>Female Age Distribution</h4>
                    <div className="age-donut" style={{ background: femaleAgeBackground }}>
                      <div className="age-donut__inner">
                        {hoveredFemaleAgeIndex !== null ? (
                          <>
                            <span className="age-donut__label">{AGE_LABELS[hoveredFemaleAgeIndex]}</span>
                            <span className="age-donut__value">
                              {femaleAgePercentages[hoveredFemaleAgeIndex].toFixed(1)}%
                            </span>
                          </>
                        ) : (
                          <span className="age-donut__hint">Hover</span>
                        )}
                      </div>
                    </div>
                    <div className="age-legend-grid">
                      {AGE_LABELS.map((label, index) => (
                        <div
                          className={`age-legend-item ${hoveredFemaleAgeIndex === index ? 'active' : ''}`}
                          key={`female-${label}`}
                          onMouseEnter={() => setHoveredFemaleAgeIndex(index)}
                          onMouseLeave={() => setHoveredFemaleAgeIndex(null)}
                        >
                          <span
                            className="age-legend-dot"
                            style={{ background: FEMALE_AGE_COLORS[index] }}
                          />
                          <span>{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {(sidebarTab === 'similar' || sidebarTab === 'nearby') && nearbyLoading && (
              <div className="sidebar-state">Loading nearby data...</div>
            )}

            {(sidebarTab === 'similar' || sidebarTab === 'nearby') && !nearbyLoading && nearbyError && (
              <div className="sidebar-state sidebar-state--error">{nearbyError}</div>
            )}

            {!nearbyLoading && !nearbyError && sidebarTab === 'similar' && (
              <div className="tab-content">
                {similarStores.length === 0 ? (
                  <div className="sidebar-state">No similar stores found.</div>
                ) : (
                  <div className="item-list">
                    {similarStores.map((store) => (
                      <button
                        key={store.id}
                        className={`item-row ${selectedStore.id === store.id ? 'active' : ''}`}
                        onClick={() => handleSimilarStoreSelect(store)}
                      >
                        <div className="item-row__title">{store.name}</div>
                        <div className="item-row__subtitle">{store.address}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!nearbyLoading && !nearbyError && sidebarTab === 'nearby' && (
              <div className="tab-content">
                <div className="category-bars">
                  {categoryEntries.length === 0 ? (
                    <div className="sidebar-state">No nearby places found.</div>
                  ) : (
                    categoryEntries.map(([category, count]) => (
                      <div className="category-row" key={category}>
                        <div className="category-row__head">
                          <span>{category}</span>
                          <strong>{count}</strong>
                        </div>
                        <div className="category-row__track">
                          <div
                            className="category-row__fill"
                            style={{ width: `${(count / maxCategoryCount) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="item-list item-list--poi">
                  {nearbyPlaces.map((place) => (
                    <button
                      key={place.id}
                      className={`item-row ${selectedPoiId === place.id ? 'active active-poi' : ''}`}
                      onClick={() => {
                        setSelectedPoiId(place.id)
                        mapRef.current?.flyTo({
                          center: [place.lon, place.lat],
                          zoom: Math.max(mapRef.current.getZoom(), 16),
                          duration: 600,
                        })
                      }}
                    >
                      <div className="item-row__title">{place.name}</div>
                      <div className="item-row__meta">{place.top_category}</div>
                      <div className="item-row__subtitle">{place.address}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  )
}

export default App
