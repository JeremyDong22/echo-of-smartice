// Version: 1.0.0
// Service for managing restaurant data

import { supabase } from './supabase'
import type { Restaurant } from '../types/database'

/**
 * Fetch all restaurants
 */
export const getAllRestaurants = async (): Promise<Restaurant[]> => {
  const { data, error } = await supabase
    .from('roleplay_restaurants')
    .select('*')
    .order('name', { ascending: true })

  if (error) {
    throw new Error(`Failed to fetch restaurants: ${error.message}`)
  }

  return data || []
}

/**
 * Get a single restaurant by ID
 */
export const getRestaurantById = async (restaurantId: string): Promise<Restaurant | null> => {
  const { data, error } = await supabase
    .from('roleplay_restaurants')
    .select('*')
    .eq('id', restaurantId)
    .single()

  if (error) {
    throw new Error(`Failed to fetch restaurant: ${error.message}`)
  }

  return data
}
