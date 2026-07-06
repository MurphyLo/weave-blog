import { Bio } from "@/components/home/Bio";
import { PostList } from "@/components/home/PostList";

export default function HomePage() {
  return (
    <div className="container">
      <div className="homepage">
        <Bio />
        <PostList />
      </div>
    </div>
  );
}
