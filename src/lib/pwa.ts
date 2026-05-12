const SERVICE_WORKER_URL = `${import.meta.env.BASE_URL}sw.js`

export function registerPwaServiceWorker() {
  if (!import.meta.env.PROD || typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return
  }

  const register = async () => {
    try {
      const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL)
      const revalidate = () => {
        void registration.update().catch(() => {})
      }

      window.addEventListener('focus', revalidate)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          revalidate()
        }
      })
    } catch (error) {
      console.error('Failed to register the PWA service worker.', error)
    }
  }

  if (document.readyState === 'complete') {
    void register()
    return
  }

  window.addEventListener(
    'load',
    () => {
      void register()
    },
    { once: true }
  )
}
