import type { Destination } from './data.ts';

export function travelFaqs(destination: Destination) {
  return [
    { id: 'entry', question: `How do I check entry requirements for ${destination.name}?`, answer: 'Check the destination government guidance for your passport, nationality, transit route and length of stay, then confirm airline document checks. This demo cannot determine visa eligibility or promise entry.' },
    { id: 'transfers', question: 'How do the airport and local transfers work?', answer: `${destination.gettingAround} A real quote should list every included transfer, connection buffer and any arrival-time restrictions. Do not assume international flights are included.` },
    { id: 'price', question: 'What does the package price include?', answer: 'Open a package itinerary for its nights, stay category, stated meals, transfers and hosted experiences. Sample prices assume two adults sharing. International flights, insurance and unlisted extras are excluded; a final provider quote would confirm taxes and fees.' },
    { id: 'luggage', question: 'What should I check about luggage and walking?', answer: `${destination.practicalNotes[0]} Confirm bag allowances for each carrier or transfer and ask about stairs, walking distances and luggage handling. Describe any accessibility needs before selecting stays.` },
    { id: 'season', question: 'What if the weather changes our plans?', answer: `${destination.season} Keep an alternative indoor or low-intensity activity. No weather, blossom timing, sea conditions or activity operation is guaranteed by this prototype.` },
    { id: 'changes', question: 'Can I change my dates or cancel?', answer: 'No reservation or payment is made here. In a real booking, request the deposit schedule, change fees, cancellation deadlines and refund conditions in writing before paying. Different services may have different terms.' },
    { id: 'insurance', question: 'What should I ask about travel insurance?', answer: 'Consider the coverage you need for cancellation, medical assistance, luggage and planned activities. Read the policy exclusions and check that destinations and activities are covered. Wanderly does not sell or assess insurance in this demo.' },
    { id: 'family', question: 'Can this trip work for children or a slower walking pace?', answer: 'Ask about room configuration, child pricing, pool and water access, stairs, walking distances and transfer times. The illustrated stay categories are not accessibility certifications; these needs require confirmation with the actual provider.' },
  ];
}
