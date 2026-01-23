import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Heart } from 'lucide-react'
import Link from 'next/link'

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
              <Heart className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              123impact
            </h1>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">Terms of Service</CardTitle>
            <p className="text-sm text-gray-500">Last updated: January 2026</p>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg mb-6">
              <p className="text-sm text-yellow-800 font-medium">
                ⚠️ This is a placeholder document. Legal terms will be added before launch.
              </p>
            </div>

            <h2>1. Acceptance of Terms</h2>
            <p>
              By accessing and using 123impact ("the Service"), you accept and agree to be bound by the terms and provision of this agreement.
            </p>

            <h2>2. Description of Service</h2>
            <p>
              123impact provides volunteer event management and scheduling tools for nonprofit organizations.
            </p>

            <h2>3. User Accounts</h2>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.
            </p>

            <h2>4. Acceptable Use</h2>
            <p>
              You agree to use the Service only for lawful purposes and in accordance with these Terms.
            </p>

            <h2>5. Data and Privacy</h2>
            <p>
              Your use of the Service is also governed by our Privacy Policy. Please review our Privacy Policy to understand our practices.
            </p>

            <h2>6. Limitation of Liability</h2>
            <p>
              The Service is provided "as is" without warranties of any kind, either express or implied.
            </p>

            <h2>7. Contact</h2>
            <p>
              For questions about these Terms, please contact us at support@123impact.org
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
