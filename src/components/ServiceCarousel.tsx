import { useEffect, useRef } from 'react';
import { ImageWithFallback } from './figma/ImageWithFallback';

const services = [
  {
    image: 'https://images.unsplash.com/photo-1760571327612-8ab776dcd462?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxob21lJTIwcGx1bWJpbmclMjByZXBhaXJ8ZW58MXx8fHwxNzYxMzQ2NTU3fDA&ixlib=rb-4.1.0&q=80&w=400',
    title: 'Plumbing',
  },
  {
    image: 'https://images.unsplash.com/photo-1646640345481-81d36b291b39?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxlbGVjdHJpY2FsJTIwd29yayUyMGluc3RhbGxhdGlvbnxlbnwxfHx8fDE3NjEzNDY1NTd8MA&ixlib=rb-4.1.0&q=80&w=400',
    title: 'Electrical',
  },
  {
    image: 'https://images.unsplash.com/photo-1650877756623-fe394301026a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxob3VzZSUyMHBhaW50aW5nJTIwaW50ZXJpb3J8ZW58MXx8fHwxNzYxMjg3NjU1fDA&ixlib=rb-4.1.0&q=80&w=400',
    title: 'Painting',
  },
  {
    image: 'https://images.unsplash.com/photo-1734079692079-172d8243ebd3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsYW5kc2NhcGluZyUyMGdhcmRlbiUyMHdvcmt8ZW58MXx8fHwxNzYxMzIyNzA4fDA&ixlib=rb-4.1.0&q=80&w=400',
    title: 'Landscaping',
  },
  {
    image: 'https://images.unsplash.com/photo-1570690732090-275b8807dd76?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxyb29mJTIwcmVwYWlyJTIwaG91c2V8ZW58MXx8fHwxNzYxMzQ2NTU4fDA&ixlib=rb-4.1.0&q=80&w=400',
    title: 'Roofing',
  },
  {
    image: 'https://images.unsplash.com/photo-1579926716139-2c80ed956d32?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxodmFjJTIwaW5zdGFsbGF0aW9uJTIwaG9tZXxlbnwxfHx8fDE3NjEzNDY1NTh8MA&ixlib=rb-4.1.0&q=80&w=400',
    title: 'HVAC',
  },
  {
    image: 'https://images.unsplash.com/photo-1618832515490-e181c4794a45?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxraXRjaGVuJTIwcmVub3ZhdGlvbnxlbnwxfHx8fDE3NjEyNzEzNTl8MA&ixlib=rb-4.1.0&q=80&w=400',
    title: 'Kitchen',
  },
  {
    image: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiYXRocm9vbSUyMHJlbW9kZWxpbmd8ZW58MXx8fHwxNzYxMzQ2NTU4fDA&ixlib=rb-4.1.0&q=80&w=400',
    title: 'Bathroom',
  }
];

// Double the array for seamless loop
const doubledServices = [...services, ...services];

export function ServiceCarousel() {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;

    let scrollPosition = 0;
    const scrollSpeed = 0.5;

    const animate = () => {
      scrollPosition += scrollSpeed;
      
      const maxScroll = scrollContainer.scrollWidth / 2;
      if (scrollPosition >= maxScroll) {
        scrollPosition = 0;
      }
      
      scrollContainer.scrollLeft = scrollPosition;
      requestAnimationFrame(animate);
    };

    const animationFrame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationFrame);
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none z-0">
      <div className="absolute inset-0 overflow-hidden">
        <div 
          ref={scrollRef}
          className="flex gap-8 h-full items-center overflow-x-hidden"
          style={{ scrollBehavior: 'auto' }}
        >
          {doubledServices.map((service, idx) => (
            <div
              key={idx}
              className="flex-shrink-0 w-96 h-64 rounded-2xl overflow-hidden bg-gray-300 grayscale opacity-30"
            >
              <ImageWithFallback
                src={service.image}
                alt={service.title}
                className="w-full h-full object-cover"
              />
            </div>
          ))}
        </div>
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-white/70 via-white/50 to-white/70 pointer-events-none" />
    </div>
  );
}
