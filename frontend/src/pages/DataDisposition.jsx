import { useNavigate } from 'react-router-dom';

export default function DataDisposition() {
    const navigate = useNavigate();

    return (
        <div className="fixed inset-0 z-50 bg-[#0c0e1a]">
            {/* Floating back button */}
            <button
                onClick={() => navigate('/')}
                className="absolute top-4 left-4 z-50 flex items-center gap-2 bg-[#1a1d2e] hover:bg-indigo-600 border border-white/10 hover:border-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-all duration-200 shadow-lg hover:shadow-indigo-900/40 backdrop-blur-sm"
            >
                <i className="fas fa-arrow-left text-xs"></i>
                Back to Data Commander
            </button>

            <iframe
                src="http://localhost:3978/tabs"
                className="w-full h-full border-0"
                title="Data Disposition"
                allow="same-origin"
            />
        </div>
    );
}
