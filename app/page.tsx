import Header from '@/components/layout/Header'

export default function Home() {
  return (
    <>
      <Header />
      <main className="container mx-auto px-4 py-16">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Welcome to 123impact
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Powerful volunteer scheduling for nonprofits
          </p>
          <div className="inline-block px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-semibold">
            Coming Soon
          </div>
        </div>
      </main>
    </>
  )
}
