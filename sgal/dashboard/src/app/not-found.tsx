import Link from 'next/link';

export default function NotFound() {
    return (
        <div className="flex flex-col items-center justify-center min-vh-100 text-center p-8">
            <h2 className="text-4xl font-bold text-white mb-4">404 - Page Not Found</h2>
            <p className="text-slate-400 mb-8">The page you are looking for does not exist or has been moved.</p>
            <Link
                href="/"
                className="px-6 py-3 bg-gradient-to-r from-[#7e22ce] to-[#00f0ff] rounded-full text-white font-bold transition-transform hover:scale-105"
            >
                Return Home
            </Link>
        </div>
    );
}
