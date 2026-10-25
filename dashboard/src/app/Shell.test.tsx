import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { DataProvider } from '../data/DataProvider'
import { fakeSource } from '../testing/fakeSource'
import { AuthProvider } from './auth'
import { Shell } from './Shell'

describe('Shell', () => {
  it('shows Home, Week, Trends and System in both the sidebar and the tab bar', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <DataProvider sourceOverride={fakeSource()}>
            <Routes><Route element={<Shell />}><Route index element={<p>page</p>} /></Route></Routes>
          </DataProvider>
        </AuthProvider>
      </MemoryRouter>,
    )
    for (const nav of ['Main', 'Tabs']) {
      const links = screen.getByRole('navigation', { name: nav }).querySelectorAll('a')
      expect([...links].map((a) => a.textContent)).toEqual(['Home', 'Week', 'Trends', 'System'])
    }
  })
})
