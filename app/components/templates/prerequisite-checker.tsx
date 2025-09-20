"use client";

import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { api } from "@/convex/_generated/api";
import { useUser } from "@/app/providers/user-provider";
import { getTemplateById } from "@/lib/templates/registry";
import {
  checkTemplatePrerequisites,
  getPrerequisiteDescription,
} from "@/lib/templates/prerequisites";
import { getConnectorConfig } from "@/lib/config/tools";
import type { ConnectorType } from "@/lib/types";
import { Check, Warning, Link } from "@phosphor-icons/react";

type PrerequisiteCheckerProps = {
  templateId: string;
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  returnPath?: string;
};

export function PrerequisiteChecker({
  templateId,
  isOpen,
  onClose,
  onComplete,
  returnPath = `/templates`,
}: PrerequisiteCheckerProps) {
  const { user } = useUser();
  const [connectingConnector, setConnectingConnector] =
    useState<ConnectorType | null>(null);

  // Get user's connectors
  const { data: userConnectors = [], refetch: refetchConnectors } = useQuery({
    ...convexQuery(api.connectors.listUserConnectors, {}),
    enabled: Boolean(user),
  });

  const template = getTemplateById(templateId);
  const prerequisites = template
    ? checkTemplatePrerequisites(templateId, userConnectors)
    : null;

  // Auto-complete when all prerequisites are met
  useEffect(() => {
    if (prerequisites?.canUse) {
      // Small delay to let user see the completion state
      const timer = setTimeout(() => {
        onComplete();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [prerequisites?.canUse, onComplete]);

  const handleConnect = async (connectorType: ConnectorType) => {
    setConnectingConnector(connectorType);

    try {
      const response = await fetch("/api/composio/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectorType,
          returnUrl: `${window.location.origin}${returnPath}?template=${templateId}&connecting=${connectorType}`,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to initiate connection");
      }

      const { redirectUrl } = await response.json();
      window.location.href = redirectUrl;
    } catch (error) {
      console.error("Connection failed:", error);
      setConnectingConnector(null);
    }
  };

  // Check if we're returning from a connection flow
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const connectingParam = urlParams.get("connecting");

    if (connectingParam) {
      // User returned from connection flow, refetch connectors
      refetchConnectors();
      setConnectingConnector(null);

      // Clean up URL
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete("connecting");
      window.history.replaceState({}, "", newUrl.toString());
    }
  }, [refetchConnectors]);

  if (!template || !prerequisites) {
    return null;
  }

  const ConnectorCard = ({
    connectorType,
    isRequired,
  }: {
    connectorType: ConnectorType;
    isRequired: boolean;
  }) => {
    const config = getConnectorConfig(connectorType);
    const isConnected =
      prerequisites.availableRequired.includes(connectorType) ||
      prerequisites.availableOptional.includes(connectorType);
    const isConnecting = connectingConnector === connectorType;

    return (
      <Card
        className={`transition-colors ${isConnected ? "border-green-200 bg-green-50/50" : ""}`}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-2xl">
                {React.createElement(config.icon, { className: "h-6 w-6" })}
              </div>
              <div>
                <CardTitle className="text-sm">{config.displayName}</CardTitle>
                <CardDescription className="text-xs">
                  {isRequired ? "Required" : "Optional"}
                </CardDescription>
              </div>
            </div>
            <div>
              {isConnected ? (
                <Badge variant="success" className="gap-1">
                  <Check className="h-3 w-3" />
                  Connected
                </Badge>
              ) : (
                <Badge
                  variant={isRequired ? "destructive" : "secondary"}
                  className="gap-1"
                >
                  <Warning className="h-3 w-3" />
                  {isRequired ? "Required" : "Optional"}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground mb-3">
            {config.description}
          </p>
          {!isConnected && (
            <Button
              size="sm"
              className="w-full gap-2"
              onClick={() => handleConnect(connectorType)}
              disabled={isConnecting}
              variant={isRequired ? "default" : "outline"}
            >
              <Link className="h-3 w-3" />
              {isConnecting ? "Connecting..." : "Connect"}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-2xl">{template.icon}</span>
            Setup {template.name}
          </DialogTitle>
          <DialogDescription>
            {prerequisites.canUse
              ? "All prerequisites are met! You can now use this template."
              : "Connect the required tools to use this template."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Setup Progress</span>
              <span>{prerequisites.completionPercentage}% Complete</span>
            </div>
            <Progress
              value={prerequisites.completionPercentage}
              className="h-2"
            />
            <p className="text-xs text-muted-foreground">
              {getPrerequisiteDescription(prerequisites)}
            </p>
          </div>

          {/* Template Description */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">About This Template</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground mb-3">
                {template.longDescription}
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Category: {template.category}</span>
                <span>•</span>
                <span>Execution time: {template.estimatedExecutionTime}</span>
              </div>
            </CardContent>
          </Card>

          {/* Required Connectors */}
          {prerequisites.missingRequired.length > 0 && (
            <div>
              <h3 className="font-medium text-sm mb-3 text-red-700">
                Required Tools ({prerequisites.missingRequired.length} missing)
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {template.requiredConnectors.map((connectorType) => (
                  <ConnectorCard
                    key={connectorType}
                    connectorType={connectorType}
                    isRequired={true}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Already Connected Required Tools */}
          {prerequisites.availableRequired.length > 0 && (
            <div>
              <h3 className="font-medium text-sm mb-3 text-green-700">
                Connected Required Tools
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {prerequisites.availableRequired.map((connectorType) => (
                  <ConnectorCard
                    key={connectorType}
                    connectorType={connectorType}
                    isRequired={true}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Optional Connectors */}
          {template.optionalConnectors &&
            template.optionalConnectors.length > 0 && (
              <div>
                <h3 className="font-medium text-sm mb-3 text-blue-700">
                  Optional Tools (Enhanced Functionality)
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {template.optionalConnectors.map((connectorType) => (
                    <ConnectorCard
                      key={connectorType}
                      connectorType={connectorType}
                      isRequired={false}
                    />
                  ))}
                </div>
              </div>
            )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            {prerequisites.canUse ? (
              <Button onClick={onComplete} className="flex-1">
                Continue to Setup
              </Button>
            ) : (
              <Button variant="secondary" className="flex-1" disabled>
                Complete Connections First
              </Button>
            )}
          </div>

          {/* Help Text */}
          <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
            <p className="mb-1 font-medium">Need help?</p>
            <p>
              Each tool connection uses secure OAuth. You can manage and
              disconnect tools anytime in{" "}
              <a href="/settings/connectors" className="underline">
                Settings
              </a>
              .
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
