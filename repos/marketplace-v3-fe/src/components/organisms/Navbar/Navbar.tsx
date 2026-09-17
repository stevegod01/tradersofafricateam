"use client";

import { useState } from "react";

import { AnimatePresence } from "framer-motion";

import MainBar from "@/components/molecules/MainBar/MainBar";
import Sidebar from "@/components/molecules/Sidebar/Sidebar";

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggle = () => {
    setMobileOpen((prev) => !prev);
  };

  return (
    <header
      className={`w-full sticky top-0 bg-background ${mobileOpen ? "z-60" : "z-40"}`}
    >
      <MainBar mobileOpen={mobileOpen} toggle={toggle} />
      <AnimatePresence mode="wait">
        {mobileOpen && <Sidebar toggle={toggle} />}
      </AnimatePresence>
    </header>
  );
};

export default Navbar;
