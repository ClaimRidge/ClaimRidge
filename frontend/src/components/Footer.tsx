import ClaimRidgeLogo from "@/components/ClaimRidgeLogo";

export default function Footer() {
  return (
    <footer className="bg-white text-[#6b7280] py-8 border-t border-[#f3f4f6]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <ClaimRidgeLogo size={26} variant="light" />
          <p className="text-sm">
            &copy; {new Date().getFullYear()} ClaimRidge. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
