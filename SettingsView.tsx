import React from "react";
import { Button } from "./components";
import { db } from "./db";

export const SettingsView = () => {
  return (
    <div className="p-8 text-center space-y-4 pt-24">
      <h2 className="text-xl font-bold">Settings</h2>
      <Button 
        variant="danger" 
        onClick={() => { 
          if (confirm("Reset Orbit?")) 
            db.delete().then(() => window.location.reload()); 
        }}
      >
        Factory Reset
      </Button>
    </div>
  );
};