declare module 'react-router-dom' {
  import type { ComponentType, ReactNode, ReactElement, FormEvent } from 'react'

  // BrowserRouter
  export interface BrowserRouterProps {
    basename?: string
    children?: ReactNode
    window?: Window
  }
  export const BrowserRouter: ComponentType<BrowserRouterProps>

  // Routes & Route
  export interface RoutesProps {
    children?: ReactNode
    location?: Partial<Location> | string
  }
  export const Routes: ComponentType<RoutesProps>

  export interface RouteProps {
    caseSensitive?: boolean
    children?: ReactNode
    element?: ReactNode | null
    index?: boolean
    path?: string
  }
  export const Route: ComponentType<RouteProps>

  // Navigate
  export interface NavigateProps {
    to: string | Partial<{ pathname: string; search: string; hash: string }>
    replace?: boolean
    state?: unknown
    relative?: 'route' | 'path'
  }
  export const Navigate: ComponentType<NavigateProps>

  // Link
  export interface LinkProps {
    to: string | Partial<{ pathname: string; search: string; hash: string }>
    replace?: boolean
    state?: unknown
    reloadDocument?: boolean
    preventScrollReset?: boolean
    relative?: 'route' | 'path'
    className?: string
    style?: React.CSSProperties
    children?: ReactNode
    onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void
  }
  export const Link: ComponentType<LinkProps>

  // NavLink
  export interface NavLinkProps extends LinkProps {
    caseSensitive?: boolean
    end?: boolean
    className?: string | ((props: { isActive: boolean; isPending: boolean }) => string | undefined)
    style?: React.CSSProperties | ((props: { isActive: boolean; isPending: boolean }) => React.CSSProperties | undefined)
  }
  export const NavLink: ComponentType<NavLinkProps>

  // Outlet
  export interface OutletProps {
    context?: unknown
  }
  export const Outlet: ComponentType<OutletProps>

  // Hooks
  export interface NavigateFunction {
    (to: string | number, options?: { replace?: boolean; state?: unknown; relative?: 'route' | 'path' }): void
  }

  export function useNavigate(): NavigateFunction
  export function useLocation(): {
    pathname: string
    search: string
    hash: string
    state: unknown
    key: string
  }
  export function useParams<T extends Record<string, string | undefined> = Record<string, string | undefined>>(): T
  export function useSearchParams(): [URLSearchParams, (nextInit: URLSearchParams | ((prev: URLSearchParams) => URLSearchParams)) => void]
  export function useOutletContext<T = unknown>(): T
  export function useMatch(pattern: string): { params: Record<string, string | undefined>; pathname: string; pattern: { path: string } } | null
}
