import Leaderboard from "../components/Leaderboard";

// Dedicated leaderboard page (its own route + bottom-nav tab on mobile). The
// Leaderboard component already renders the full top-100 table + rank legend.
export default function LeaderboardPage() {
  return (
    <div className="lb-page">
      <Leaderboard />
    </div>
  );
}
