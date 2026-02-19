export interface Store {
  id: string
  google_lat: number
  google_lon: number
  name: string
  category: string
  address: string
  phone: string
  rating: number
  location_type: string
  parking: string
  store_size: string
  T_TL: number
  expenditure_band: string
}

export async function loadStoresFromCSV(): Promise<Store[]> {
  try {
    // Fetch the CSV file - in dev mode, Vite serves /src directly
    const response = await fetch('/src/assets/final_alfamart_data_12850.csv')
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    const csvText = await response.text()
    return parseCSV(csvText)
  } catch (error) {
    console.error('Error loading CSV:', error)
    return []
  }
}

function parseCSV(csvText: string): Store[] {
  const lines = csvText.trim().split('\n')
  if (lines.length < 2) return []

  const headers = lines[0].split(',')
  const stores: Store[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue

    // Handle quoted fields
    const fields = parseCSVLine(line)
    
    const store: Store = {
      id: fields[headers.indexOf('id')],
      google_lat: parseFloat(fields[headers.indexOf('google_lat')]),
      google_lon: parseFloat(fields[headers.indexOf('google_lon')]),
      name: fields[headers.indexOf('name')],
      category: fields[headers.indexOf('category')],
      address: fields[headers.indexOf('address')],
      phone: fields[headers.indexOf('phone')] || '',
      rating: parseFloat(fields[headers.indexOf('rating')]) || 0,
      location_type: fields[headers.indexOf('location_type')] || '',
      parking: fields[headers.indexOf('parking')] || '',
      store_size: fields[headers.indexOf('store_size')] || '',
      T_TL: parseFloat(fields[headers.indexOf('T_TL')]) || 0,
      expenditure_band:
        fields[headers.indexOf('expenditure_band')] ||
        fields[headers.indexOf('expenditure')] ||
        '',
    }

    // Only add if we have valid coordinates
    if (!isNaN(store.google_lat) && !isNaN(store.google_lon)) {
      stores.push(store)
    }
  }

  return stores
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let insideQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const nextChar = line[i + 1]

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        // Escaped quote
        current += '"'
        i++ // Skip next quote
      } else {
        // Toggle quote state
        insideQuotes = !insideQuotes
      }
    } else if (char === ',' && !insideQuotes) {
      // Field separator
      fields.push(current)
      current = ''
    } else {
      current += char
    }
  }

  fields.push(current)
  return fields
}
