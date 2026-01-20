import { Heart } from 'lucide-react'
import Link from 'next/link'

export default function Header() {
  return (
    <header className="border-b bg-white">
      <div className="container mx-auto px-4 py-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
            <Heart className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">123impact</h1>
            <p className="text-xs text-gray-600">Volunteer scheduling made simple</p>
          </div>
        </Link>
      </div>
    </header>
  )
}
