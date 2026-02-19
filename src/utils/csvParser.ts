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
  M_TL: number
  F_TL: number
  M_00_04: number
  M_05_09: number
  M_10_14: number
  M_15_19: number
  M_20_24: number
  M_25_29: number
  M_30_34: number
  M_35_39: number
  M_40_44: number
  M_45_49: number
  M_50_54: number
  M_55_59: number
  M_60_64: number
  M_65_69: number
  M_70_74: number
  M_75Plus: number
  F_00_04: number
  F_05_09: number
  F_10_14: number
  F_15_19: number
  F_20_24: number
  F_25_29: number
  F_30_34: number
  F_35_39: number
  F_40_44: number
  F_45_49: number
  F_50_54: number
  F_55_59: number
  F_60_64: number
  F_65_69: number
  F_70_74: number
  F_75Plus: number
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
      M_TL: parseFloat(fields[headers.indexOf('M_TL')]) || 0,
      F_TL: parseFloat(fields[headers.indexOf('F_TL')]) || 0,
      M_00_04: parseFloat(fields[headers.indexOf('M_00_04')]) || 0,
      M_05_09: parseFloat(fields[headers.indexOf('M_05_09')]) || 0,
      M_10_14: parseFloat(fields[headers.indexOf('M_10_14')]) || 0,
      M_15_19: parseFloat(fields[headers.indexOf('M_15_19')]) || 0,
      M_20_24: parseFloat(fields[headers.indexOf('M_20_24')]) || 0,
      M_25_29: parseFloat(fields[headers.indexOf('M_25_29')]) || 0,
      M_30_34: parseFloat(fields[headers.indexOf('M_30_34')]) || 0,
      M_35_39: parseFloat(fields[headers.indexOf('M_35_39')]) || 0,
      M_40_44: parseFloat(fields[headers.indexOf('M_40_44')]) || 0,
      M_45_49: parseFloat(fields[headers.indexOf('M_45_49')]) || 0,
      M_50_54: parseFloat(fields[headers.indexOf('M_50_54')]) || 0,
      M_55_59: parseFloat(fields[headers.indexOf('M_55_59')]) || 0,
      M_60_64: parseFloat(fields[headers.indexOf('M_60_64')]) || 0,
      M_65_69: parseFloat(fields[headers.indexOf('M_65_69')]) || 0,
      M_70_74: parseFloat(fields[headers.indexOf('M_70_74')]) || 0,
      M_75Plus: parseFloat(fields[headers.indexOf('M_75Plus')]) || 0,
      F_00_04: parseFloat(fields[headers.indexOf('F_00_04')]) || 0,
      F_05_09: parseFloat(fields[headers.indexOf('F_05_09')]) || 0,
      F_10_14: parseFloat(fields[headers.indexOf('F_10_14')]) || 0,
      F_15_19: parseFloat(fields[headers.indexOf('F_15_19')]) || 0,
      F_20_24: parseFloat(fields[headers.indexOf('F_20_24')]) || 0,
      F_25_29: parseFloat(fields[headers.indexOf('F_25_29')]) || 0,
      F_30_34: parseFloat(fields[headers.indexOf('F_30_34')]) || 0,
      F_35_39: parseFloat(fields[headers.indexOf('F_35_39')]) || 0,
      F_40_44: parseFloat(fields[headers.indexOf('F_40_44')]) || 0,
      F_45_49: parseFloat(fields[headers.indexOf('F_45_49')]) || 0,
      F_50_54: parseFloat(fields[headers.indexOf('F_50_54')]) || 0,
      F_55_59: parseFloat(fields[headers.indexOf('F_55_59')]) || 0,
      F_60_64: parseFloat(fields[headers.indexOf('F_60_64')]) || 0,
      F_65_69: parseFloat(fields[headers.indexOf('F_65_69')]) || 0,
      F_70_74: parseFloat(fields[headers.indexOf('F_70_74')]) || 0,
      F_75Plus: parseFloat(fields[headers.indexOf('F_75Plus')]) || 0,
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
