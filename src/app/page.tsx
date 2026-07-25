import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import GymApp from "./GymApp";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <GymApp userId={user.id} email={user.email ?? ""} />;
}
