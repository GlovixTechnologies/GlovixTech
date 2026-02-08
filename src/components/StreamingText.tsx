import { useState, useEffect } from 'react';

interface StreamingTextProps {
    text: string;
    className?: string;
    speed?: number; // ms per character
}

export function StreamingText({ text, className = '', speed = 30 }: StreamingTextProps) {
    const [displayedText, setDisplayedText] = useState('');
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        // Reset when text changes
        setDisplayedText('');
        setCurrentIndex(0);
    }, [text]);

    useEffect(() => {
        if (currentIndex < text.length) {
            const timeout = setTimeout(() => {
                setDisplayedText(text.slice(0, currentIndex + 1));
                setCurrentIndex(currentIndex + 1);
            }, speed);

            return () => clearTimeout(timeout);
        }
    }, [currentIndex, text, speed]);

    return (
        <span className={className}>
            {displayedText.split('').map((char, i) => (
                <span
                    key={i}
                    className="inline-block animate-fade-in"
                    style={{
                        animationDelay: `${i * 0.02}s`,
                        animationDuration: '0.3s',
                        animationFillMode: 'backwards'
                    }}
                >
                    {char}
                </span>
            ))}
        </span>
    );
}
