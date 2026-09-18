import React, { useState, useEffect } from "react";
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Row,
  Col,
  Spinner,
  Alert,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Nav,
  NavItem,
  NavLink,
  TabContent,
  TabPane,
  Badge,
} from "reactstrap";

import PanelHeader from "components/PanelHeader/PanelHeader.js";
import axios from "axios";
import { apiUrl, ROUTES } from "../../config/api";
import DataTable from "react-data-table-component";
import "../../views/mesobfinancial2.css";

const AdminSubscriptions = () => {
  const [subscriptions, setSubscriptions] = useState([]);
  const [error, setError] = useState(null);
  const [selectedSubscription, setSelectedSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("1");
  const [providerFilter, setProviderFilter] = useState("all");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const handleSubscriptionClick = (subscription) => {
    setSelectedSubscription(subscription);
    setModalOpen(true);
  };

  const toggleModal = () => {
    setModalOpen(!modalOpen);
  };

  const toggleTab = (tab) => {
    if (activeTab !== tab) setActiveTab(tab);
  };

  const detectProvider = (subscription) => {
    if (!subscription) return null;

    if (subscription.provider) return subscription.provider;

    if (subscription.id?.startsWith("I-")) return "PayPal";
    if (subscription.id?.startsWith("sub_")) return "Stripe";

    return "Unknown";
  };

  const detectStatus = (subscription) => {
    if (!subscription) return null;

    if (subscription.status) return subscription.status;

    return "Unknown";
  };

  // Desktop columns
  const desktopColumns = [
    {
      name: "Name",
      selector: (row) => row.name || "-",
      sortable: true,
      width: "180px",
    },
    {
      name: "Email",
      selector: (row) => row.email || "-",
      sortable: true,
      width: "200px",
    },
    {
      name: "Phone",
      selector: (row) => row.phone || "-",
      sortable: true,
      width: "150px",
    },
    {
      name: "Provider",
      selector: (row) => detectProvider(row) || "-",
      sortable: true,
      width: "120px",
      cell: (row) => {
        const provider = detectProvider(row);

        if (!provider || provider === "Unknown") {
          return <Badge color="secondary" pill>Unknown</Badge>;
        }

        return (
          <Badge
            color={provider.toLowerCase() === "stripe" ? "primary" : "success"}
            pill
          >
            {provider.toUpperCase()}
          </Badge>
        );
      },
    },
    {
      name: "Status",
      selector: (row) => detectStatus(row) || "-",
      sortable: true,
      width: "120px",
      cell: (row) => {
        const status = detectStatus(row);

        if (!status || status === "Unknown") {
          return <Badge color="secondary" pill>Unknown</Badge>;
        }

        const statusLower = status.toLowerCase();
        let badgeColor;

        if (statusLower === "active" || statusLower === "trialing") {
          badgeColor = "success";
        } else if (statusLower === "canceled" || statusLower === "cancelled") {
          badgeColor = "danger";
        } else if (statusLower === "past_due") {
          badgeColor = "warning";
        } else {
          badgeColor = "secondary";
        }

        return <Badge color={badgeColor} pill>{status.toUpperCase()}</Badge>;
      },
    },
    {
      name: "Plan",
      selector: (row) => row.subscriptionPlan || "-",
      sortable: true,
      width: "150px",
    },
    {
      name: "Created At",
      selector: (row) => row.createdAt,
      sortable: true,
      width: "150px",
      cell: (row) =>
        row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "-",
    },
    {
      name: "Actions",
      cell: (row) => (
        <Button
          color="info"
          size="sm"
          onClick={() => handleSubscriptionClick(row)}
        >
          View
        </Button>
      ),
      ignoreRowClick: true,
      allowOverflow: true,
      button: true,
      width: "120px",
    },
  ];

  // Mobile columns - simplified view
  const mobileColumns = [
    {
      name: "User",
      selector: (row) => row.email || "-",
      sortable: true,
      minWidth: "200px",
      cell: (row) => (
        <div>
          <div className="font-weight-bold text-primary">{row.email}</div>
          {row.name && <div className="text-muted small">Name: {row.name}</div>}
        </div>
      ),
    },
    {
      name: "Subscription",
      selector: (row) => detectStatus(row) || "-",
      sortable: true,
      width: "150px",
      cell: (row) => {
        const isActive = detectStatus(row)?.toLowerCase() === "active";
        const provider = detectProvider(row);

        return (
          <div>
            <Badge
              color={isActive ? "success" : "danger"}
              pill
              className="mb-1 d-block"
            >
              {detectStatus(row)?.toUpperCase() || "N/A"}
            </Badge>
            <Badge
              color={provider?.toLowerCase() === "stripe" ? "primary" : "success"}
              pill
              className="d-block"
            >
              {provider?.toUpperCase() || "N/A"}
            </Badge>
          </div>
        );
      },
    },
    {
      name: "Actions",
      cell: (row) => (
        <Button
          color="info"
          size="sm"
          onClick={() => handleSubscriptionClick(row)}
          className="w-100"
        >
          Details
        </Button>
      ),
      ignoreRowClick: true,
      allowOverflow: true,
      button: true,
      width: "100px",
    },
  ];

  const fetchData = async () => {
    setLoading(true);
    try {
      const subsRes = await axios.get(
        apiUrl(ROUTES.SUBSCRIPTION)
      );

      const subscriptionsData = Array.isArray(subsRes.data)
        ? subsRes.data
        : subsRes.data.subscriptions || [];

      setSubscriptions(subscriptionsData);
      setError(null);
    } catch (err) {
      console.error("Data fetch error:", err);
      setError("Failed to load subscriptions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const isSubscriptionActive = (subscription) => {
    if (!subscription || !subscription.status) return false;
    const status = subscription.status.toLowerCase();
    return status === "active" || status === "trialing";
  };

  const getFilteredSubscriptions = (subscribed) => {
    let filtered = subscriptions;

    if (subscribed) {
      filtered = subscriptions.filter((sub) => isSubscriptionActive(sub));
    } else {
      filtered = subscriptions.filter((sub) => !isSubscriptionActive(sub));
    }

    if (providerFilter !== "all" && subscribed) {
      filtered = filtered.filter(
        (sub) => detectProvider(sub)?.toLowerCase() === providerFilter.toLowerCase()
      );
    }

    return filtered;
  };

  const getProviderCounts = () => {
    const activeSubscriptions = subscriptions.filter((sub) =>
      isSubscriptionActive(sub)
    );

    const stripeCount = activeSubscriptions.filter(
      (sub) => detectProvider(sub)?.toLowerCase() === "stripe"
    ).length;

    const paypalCount = activeSubscriptions.filter(
      (sub) => detectProvider(sub)?.toLowerCase() === "paypal"
    ).length;

    return {
      stripe: stripeCount,
      paypal: paypalCount,
      total: activeSubscriptions.length,
    };
  };

  const counts = getProviderCounts();
  const unsubscribedCount = subscriptions.filter(
    (sub) => !isSubscriptionActive(sub)
  ).length;

  const MobileSubscriptionCard = ({ subscription }) => (
    <Card className="mb-3">
      <CardBody>
        <div className="d-flex justify-content-between align-items-start mb-2">
          <div className="flex-grow-1">
            <h6 className="font-weight-bold text-primary mb-1">{subscription.email || "N/A"}</h6>
            {subscription.name && (
              <p className="text-muted mb-1 small">Name: {subscription.name}</p>
            )}
          </div>
        </div>

        <div className="d-flex justify-content-between align-items-center mb-2">
          <div>
            <Badge
              color={
                subscription.status?.toLowerCase() === "active"
                  ? "success"
                  : "danger"
              }
              pill
              className="mr-2"
            >
              {subscription.status?.toUpperCase() || "N/A"}
            </Badge>
            <Badge
              color={
                detectProvider(subscription)?.toLowerCase() === "stripe"
                  ? "primary"
                  : "success"
              }
              pill
            >
              {detectProvider(subscription)?.toUpperCase() || "N/A"}
            </Badge>
          </div>
          <div className="text-right">
            <small className="text-muted d-block">
              Plan: {subscription.subscriptionPlan || "N/A"}
            </small>
            <small className="text-muted">
              Created:{" "}
              {subscription.createdAt
                ? new Date(subscription.createdAt).toLocaleDateString()
                : "-"}
            </small>
          </div>
        </div>

        <Button
          color="info"
          size="sm"
          onClick={() => handleSubscriptionClick(subscription)}
          className="w-100 mt-2"
        >
          View Details
        </Button>
      </CardBody>
    </Card>
  );

  return (
    <>
      <PanelHeader size="sm" />
      <div className="content" style={{ backgroundColor: "var(--surface-2)", paddingInline: 15 }}>
        <Row>
          <Col xs={12} style={{ paddingInline: 0 }}>
            <Card style={{ backgroundColor: "var(--surface-2)", boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4), 0 2px 6px rgba(0, 0, 0, 0.3)", borderRadius: "8px" }}>
              <CardHeader style={{ backgroundColor: "var(--surface-2)" }}>
                <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3">
                  <CardTitle tag="h4" className="mb-0" style={{ color: "var(--text-1)" }}>
                    Subscriptions
                  </CardTitle>
                  <div className="d-flex flex-wrap gap-2">
                    <Button color="secondary" className="btn-round btn-sm">
                      Total: {subscriptions.length}
                    </Button>
                    <Button color="primary" className="btn-round btn-sm">
                      Stripe: {counts.stripe}
                    </Button>
                    <Button color="success" className="btn-round btn-sm">
                      PayPal: {counts.paypal}
                    </Button>
                  </div>
                </div>

                <Nav tabs className={isMobile ? "flex-column" : ""}>
                  <NavItem className={isMobile ? "w-100" : ""}>
                    <NavLink
                      className={`text-center ${isMobile ? "w-100" : ""} ${activeTab === "1" ? "active" : ""}`}
                      onClick={() => toggleTab("1")}
                      style={{ cursor: "pointer" }}
                    >
                      Subscribed ({counts.total})
                    </NavLink>
                  </NavItem>
                  <NavItem className={isMobile ? "w-100" : ""}>
                    <NavLink
                      className={`text-center ${isMobile ? "w-100" : ""} ${activeTab === "2" ? "active" : ""}`}
                      onClick={() => toggleTab("2")}
                      style={{ cursor: "pointer" }}
                    >
                      UnSubscribed ({unsubscribedCount})
                    </NavLink>
                  </NavItem>
                </Nav>
              </CardHeader>
              <CardBody style={{ backgroundColor: "var(--surface-2)" }}>
                <TabContent activeTab={activeTab}>
                  <TabPane tabId="1">
                    <div className="mb-3">
                      <div className="d-flex flex-wrap gap-2">
                        <Button
                          color={
                            providerFilter === "all" ? "primary" : "secondary"
                          }
                          size="sm"
                          onClick={() => setProviderFilter("all")}
                        >
                          All ({counts.total})
                        </Button>
                        <Button
                          color={
                            providerFilter === "stripe"
                              ? "primary"
                              : "secondary"
                          }
                          size="sm"
                          onClick={() => setProviderFilter("stripe")}
                        >
                          Stripe ({counts.stripe})
                        </Button>
                        <Button
                          color={
                            providerFilter === "paypal"
                              ? "success"
                              : "secondary"
                          }
                          size="sm"
                          onClick={() => setProviderFilter("paypal")}
                        >
                          PayPal ({counts.paypal})
                        </Button>
                      </div>
                    </div>
                    {error ? (
                      <Alert color="danger">{error}</Alert>
                    ) : loading ? (
                      <div className="text-center py-4">
                        <Spinner color="primary" />
                        <p className="mt-2" style={{ color: "var(--text-1)" }}>Loading subscriptions...</p>
                      </div>
                    ) : isMobile ? (
                      getFilteredSubscriptions(true).length === 0 ? (
                        <div className="text-center py-4" style={{ color: "var(--text-1)" }}>
                          No active subscriptions found
                        </div>
                      ) : (
                        getFilteredSubscriptions(true).map((subscription) => (
                          <MobileSubscriptionCard
                            key={subscription.id}
                            subscription={subscription}
                          />
                        ))
                      )
                    ) : (
                      <DataTable
                        columns={desktopColumns}
                        data={getFilteredSubscriptions(true)}
                        pagination
                        responsive
                        highlightOnHover={false}
                        fixedHeader
                        fixedHeaderScrollHeight="400px"
                        noDataComponent={
                          <div className="text-center py-4" style={{ color: "var(--text-1)" }}>
                            No active subscriptions found
                          </div>
                        }
                        customStyles={{
                          table: {
                            style: {
                              backgroundColor: "#000000",
                            },
                          },
                          headRow: {
                            style: {
                              backgroundColor: "#000000",
                              color: "var(--text-1)",
                            },
                          },
                          headCells: {
                            style: {
                              backgroundColor: "#000000",
                              color: "var(--text-1)",
                            },
                          },
                          cells: {
                            style: {
                              backgroundColor: "#000000",
                              color: "var(--text-1)",
                            },
                          },
                          rows: {
                            style: {
                              backgroundColor: "#000000",
                              color: "var(--text-1)",
                              "&:hover": {
                                backgroundColor: "#000000",
                              },
                            },
                          },
                          pagination: {
                            style: {
                              backgroundColor: "#000000",
                              color: "var(--text-1)",
                            },
                          },
                        }}
                      />
                    )}
                  </TabPane>
                  <TabPane tabId="2">
                    {error ? (
                      <Alert color="danger">{error}</Alert>
                    ) : loading ? (
                      <div className="text-center py-4">
                        <Spinner color="primary" />
                        <p className="mt-2" style={{ color: "var(--text-1)" }}>Loading data...</p>
                      </div>
                    ) : isMobile ? (
                      getFilteredSubscriptions(false).length === 0 ? (
                        <div className="text-center py-4" style={{ color: "var(--text-1)" }}>
                          No cancelled/inactive subscriptions found
                        </div>
                      ) : (
                        getFilteredSubscriptions(false).map((subscription) => (
                          <MobileSubscriptionCard
                            key={subscription.id}
                            subscription={subscription}
                          />
                        ))
                      )
                    ) : (
                      <DataTable
                        columns={desktopColumns}
                        data={getFilteredSubscriptions(false)}
                        pagination
                        responsive
                        highlightOnHover={false}
                        fixedHeader
                        fixedHeaderScrollHeight="400px"
                        noDataComponent={
                          <div className="text-center py-4" style={{ color: "var(--text-1)" }}>
                            No cancelled/inactive subscriptions found
                          </div>
                        }
                        customStyles={{
                          table: {
                            style: {
                              backgroundColor: "#000000",
                            },
                          },
                          headRow: {
                            style: {
                              backgroundColor: "#000000",
                              color: "var(--text-1)",
                            },
                          },
                          headCells: {
                            style: {
                              backgroundColor: "#000000",
                              color: "var(--text-1)",
                            },
                          },
                          cells: {
                            style: {
                              backgroundColor: "#000000",
                              color: "var(--text-1)",
                            },
                          },
                          rows: {
                            style: {
                              backgroundColor: "#000000",
                              color: "var(--text-1)",
                              "&:hover": {
                                backgroundColor: "#000000",
                              },
                            },
                          },
                          pagination: {
                            style: {
                              backgroundColor: "#000000",
                              color: "var(--text-1)",
                            },
                          },
                        }}
                      />
                    )}
                  </TabPane>
                </TabContent>
              </CardBody>
            </Card>
          </Col>
        </Row>
      </div>

      <Modal
        isOpen={modalOpen}
        toggle={toggleModal}
        size={isMobile ? "lg" : "xl"}
        className="modal-dialog-centered"
      >
        <ModalHeader toggle={toggleModal}>Subscription Details</ModalHeader>
        <ModalBody>
          {selectedSubscription ? (
            <Row>
              <Col xs={12} sm={6} className="mb-3">
                <strong>Provider:</strong>{" "}
                <Badge
                  color={
                    selectedSubscription.provider?.toLowerCase() === "stripe"
                      ? "primary"
                      : "success"
                  }
                  pill
                  className="ml-2"
                >
                  {selectedSubscription.provider?.toUpperCase() || "N/A"}
                </Badge>
              </Col>
              <Col xs={12} sm={6} className="mb-3">
                <strong>Status:</strong>{" "}
                <Badge
                  color={
                    selectedSubscription.status?.toLowerCase() === "active"
                      ? "success"
                      : "danger"
                  }
                  pill
                  className="ml-2"
                >
                  {selectedSubscription.status?.toUpperCase() || "N/A"}
                </Badge>
              </Col>
              <Col xs={12} sm={6} className="mb-3">
                <strong>ID:</strong> {selectedSubscription.id || "N/A"}
              </Col>
              <Col xs={12} sm={6} className="mb-3">
                <strong>Name:</strong> {selectedSubscription.name || "N/A"}
              </Col>
              <Col xs={12} sm={6} className="mb-3">
                <strong>Email:</strong> {selectedSubscription.email || "N/A"}
              </Col>
              <Col xs={12} sm={6} className="mb-3">
                <strong>Phone:</strong> {selectedSubscription.phone || "N/A"}
              </Col>
              <Col xs={12} sm={6} className="mb-3">
                <strong>User ID:</strong> {selectedSubscription.userId || "N/A"}
              </Col>
              <Col xs={12} sm={6} className="mb-3">
                <strong>Payment Method:</strong>{" "}
                {selectedSubscription.paymentMethodId || "N/A"}
              </Col>
              <Col xs={12} className="mb-3">
                <strong>Address:</strong> {selectedSubscription.address || "N/A"}
              </Col>
              <Col xs={12} className="mb-3">
                <strong>Plan:</strong> {selectedSubscription.subscriptionPlan || "N/A"}
              </Col>
              <Col xs={12} sm={6} className="mb-3">
                <strong>Start Date:</strong>{" "}
                {selectedSubscription.startDate
                  ? new Date(selectedSubscription.startDate).toLocaleString()
                  : "N/A"}
              </Col>
              <Col xs={12} sm={6} className="mb-3">
                <strong>Expire Date:</strong>{" "}
                {selectedSubscription.expireDate &&
                  selectedSubscription.expireDate !== "N/A"
                  ? new Date(selectedSubscription.expireDate).toLocaleString()
                  : "N/A"}
              </Col>
              <Col xs={12} sm={6} className="mb-3">
                <strong>Created At:</strong>{" "}
                {selectedSubscription.createdAt
                  ? new Date(selectedSubscription.createdAt).toLocaleString()
                  : "N/A"}
              </Col>
            </Row>
          ) : (
            <p className="text-center text-muted">No subscription data found.</p>
          )}
        </ModalBody>
        <ModalFooter>
          <Button
            color="secondary"
            onClick={toggleModal}
            className="w-100 w-sm-auto"
          >
            Close
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
};

export default AdminSubscriptions;