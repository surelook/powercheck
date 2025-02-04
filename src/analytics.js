import Analytics from "analytics";
import googleAnalytics from "@analytics/google-analytics";

const GA_TRACKING_ID = import.meta.env.VITE_GA_TRACKING_ID;

if (GA_TRACKING_ID) {
  const analytics = Analytics({
    app: "surelook/powercheck",
    plugins: [
      googleAnalytics({
        measurementIds: [GA_TRACKING_ID],
      }),
    ],
  });

  analytics.page();
}

export default undefined;
