import {
  LayoutDashboard,
  Building2,
  ReceiptIndianRupee,
  WalletCards,
  ShoppingCart,
  Truck,
  Landmark,
  Users,
  Boxes,
  Upload,
  BarChart3,
  Settings,
  Scale,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
}

export const navItems: NavItem[] = [
  { label: 'Overview', href: '/', icon: LayoutDashboard },
  { label: 'Canteens', href: '/canteens', icon: Building2 },
  { label: 'Sales Register', href: '/sales', icon: ReceiptIndianRupee },
  { label: 'Expense Register', href: '/expenses', icon: WalletCards },
  { label: 'Purchases', href: '/purchases', icon: ShoppingCart },
  { label: 'Vendors', href: '/vendors', icon: Truck },
  { label: 'Collections', href: '/collections', icon: Landmark },
  { label: 'Staff & Salaries', href: '/staff', icon: Users },
  { label: 'Inventory', href: '/inventory', icon: Boxes },
  { label: 'Upload Data', href: '/upload', icon: Upload },
  { label: 'Profit & Sharing', href: '/profit-sharing', icon: Scale },
  { label: 'Reports & Exports', href: '/reports', icon: BarChart3 },
  { label: 'Settings', href: '/settings', icon: Settings },
]
