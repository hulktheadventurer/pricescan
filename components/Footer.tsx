export default function Footer() {
  return (
    <footer className="mt-16 py-6 border-t text-sm text-gray-500">
      <div className="max-w-6xl mx-auto flex justify-center space-x-6">
        <a href="/privacy" className="hover:underline">Privacy</a>
        <a href="/terms" className="hover:underline">Terms</a>
      </div>
    </footer>
  );
}
