import { API_BASE } from './api'

export async function obtenerMisTareas(usuarioId: number) {
  try {
    const token = localStorage.getItem('ticket_access')
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const response = await fetch(`${API_BASE}/tareas/?usuario_id=${usuarioId}`, {
      method: 'GET',
      headers,
    })

    if (!response.ok) {
      throw new Error('Error al cargar las tareas')
    }

    return await response.json()
  } catch (error) {
    console.error('Error fetching tasks:', error)
    throw error
  }
}

export async function crearTarea(data: {
  ticket: number
  usuario_asignado: number
  asignado_por: string
  estado?: string
  observaciones?: string
}) {
  try {
    const token = localStorage.getItem('ticket_access')
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const response = await fetch(`${API_BASE}/tareas/`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Error al crear la tarea')
    }

    return await response.json()
  } catch (error) {
    console.error('Error creating task:', error)
    throw error
  }
}

export async function actualizarTarea(
  tareaId: number,
  data: Partial<{
    estado: string
    observaciones: string
  }>
) {
  try {
    const token = localStorage.getItem('ticket_access')
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const response = await fetch(`${API_BASE}/tareas/${tareaId}/`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.detail || 'Error al actualizar la tarea')
    }

    return await response.json()
  } catch (error) {
    console.error('Error updating task:', error)
    throw error
  }
}
