import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Heart } from 'lucide-react'
import Link from 'next/link'

export default function PrivacyPage() {
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
            <CardTitle className="text-3xl">Privacy Policy</CardTitle>
            <p className="text-sm text-gray-500">Last updated: January 2026</p>
          </CardHeader>
          <CardContent className="prose prose-sm max-w-none">
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg mb-6">
              <p className="text-sm text-yellow-800 font-medium">
                ⚠️ This is a placeholder document. Complete privacy policy will be added before launch.
              </p>
            </div>

            <h2>1. Information We Collect</h2>
            <p>
              We collect information you provide directly to us, including when you create an account, register for events, or contact us for support.
            </p>

            <h2>2. How We Use Your Information</h2>
            <p>
              We use the information we collect to provide, maintain, and improve our services, and to communicate with you.
            </p>

            <h2>3. Information Sharing</h2>
            <p>
              We do not sell your personal information. We may share your information with event coordinators for events you register for.
            </p>

            <h2>4. Data Security</h2>
            <p>
              We implement appropriate technical and organizational measures to protect your personal information.
            </p>

            <h2>5. Your Rights</h2>
            <p>
              You have the right to access, correct, or delete your personal information. Contact us to exercise these rights.
            </p>

            <h2>6. Cookies</h2>
            <p>
              We use cookies and similar technologies to provide and support our services.
            </p>

            <h2>7. Changes to This Policy</h2>
            <p>
              We may update this privacy policy from time to time. We will notify you of any changes by posting the new policy on this page.
            </p>

            <h2>8. Contact Us</h2>
            <p>
              If you have questions about this Privacy Policy, please contact us at privacy@123impact.org
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
