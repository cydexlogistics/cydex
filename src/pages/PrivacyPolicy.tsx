import SiteLayout from "@/components/site/SiteLayout";
import { CONTACT_EMAIL } from "@/lib/site";
import { motion } from "framer-motion";

const PrivacyPolicy = () => {
  return (
    <SiteLayout>
      
      {/* Hero Section */}
      <section className="pt-24 sm:pt-28 md:pt-32 pb-12 sm:pb-16 bg-gradient-to-b from-primary-light to-background dark:from-[#0F1A0C] relative overflow-hidden">
        {/* Background Elements */}
        <div className="absolute inset-0 z-0">
          <div className="absolute top-1/4 -right-20 w-96 h-96 bg-primary opacity-10 rounded-full filter blur-3xl"></div>
          <div className="absolute -bottom-20 -left-20 w-96 h-96 bg-primary opacity-10 rounded-full filter blur-3xl"></div>
        </div>
        
        <div className="container mx-auto px-4 sm:px-6 text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-block py-1 px-4 rounded-full bg-primary/10 mb-4"
          >
            <p className="text-primary font-semibold text-xs sm:text-sm md:text-base">
              Legal Information
            </p>
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 sm:mb-5 md:mb-6"
          >
            Privacy <span className="text-primary drop-shadow-sm">Policy</span>
          </motion.h1>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-6 sm:mb-8"
          >
            Last updated: May 30, 2025
          </motion.p>
        </div>
      </section>
      
      {/* Privacy Policy Content */}
      <section className="py-12 sm:py-16 md:py-20 bg-background">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto">
            
            <div className="mb-8">
              <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
                Cydex is committed to providing secure, efficient, and eco-conscious logistics services. This Privacy Policy explains how we collect, use, protect, and share your information when you engage with our services.
              </p>
            </div>

            <div className="space-y-8">
              {/* Section 1 */}
              <section>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">1. Information We Collect</h2>
                <div className="text-muted-foreground space-y-4">
                  <p>
                    When you use the Cydex services, certain information is collected for processes such as registering your account, providing you products/services you request and conducting payment processes.
                  </p>
                  <p>
                    Users provide their information to Cydex when they want to place an order, convey their requests, suggestions and complaints to Cydex or for other reasons. In this case, certain information of Users such as name, payment information, request, suggestion and complaint information is collected.
                  </p>
                </div>
              </section>

              {/* Section 2 */}
              <section>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">2. How We Use Your Information</h2>
                <div className="text-muted-foreground space-y-4">
                  <p>User information that Cydex collects is mainly used for the following purposes:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>To provide services to users</li>
                    <li>To communicate with users; to conclude the requests and complaints</li>
                    <li>To conduct financial and accounting processes related to payments</li>
                    <li>To promote our services; conducting advertising and campaign processes</li>
                    <li>To develop/improve our products and services in accordance with user feedbacks</li>
                    <li>To personalize our services according to users' preferences, usage habits and interests</li>
                    <li>To identify and fix system problems regarding platforms we provide service; conducting information security processes</li>
                    <li>Measuring user experiences through identification technologies/cookies, improving the performance of the platforms we provide service</li>
                  </ul>
                  <p>
                    The purposes set out in this section refers to the general use of information collected about users. For detailed information about Cydex purposes of processing customer personal data and other issues related to the processing of personal data, please review Customer Personal Info Protection Policy.
                  </p>
                </div>
              </section>

              {/* Section 3 */}
              <section>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">3. Information Sharing with Third Parties</h2>
                <div className="text-muted-foreground space-y-4">
                  <p>
                    We may share your data with trusted partners such as payment processors and logistics providers to fulfill our services. All partners are contractually obligated to protect your data. In this context, your information may be shared with our business partners and service providers which support us within the scope of the supply of goods/services.
                  </p>
                  <p>
                    However, when we are asked to share your information in order to fulfill our legal obligations, your information may also be shared with authorized persons, institutions and organizations.
                  </p>
                  <p>
                    The information provided by the Users will not be transferred to third parties, except for the purposes specified in the texts provided to the users and when necessary to provide the service.
                  </p>
                </div>
              </section>

              {/* Section 4 */}
              <section>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">4. Storing and Protecting Your Information</h2>
                <div className="text-muted-foreground space-y-4">
                  <p>
                    We retain personal data for a period of 12 months after the last interaction, unless a longer retention period is required by law. If a special period is stipulated in the legislation for us to store your information, this period is respected.
                  </p>
                  <p>
                    Cydex takes the necessary technical and organizational measures to protect the systems and databases where your information is stored against data security threats (cyberattack, hash, etc.).
                  </p>
                  <p>
                    The payment infrastructure is provided by registered licensed financial institutes. The User acknowledges that he/she is fully responsible for the security, storage and prevention of learning by third parties of the system access tools (username, password, etc.) used in order to benefit from the services offered by Cydex.
                  </p>
                </div>
              </section>

              {/* Section 5 */}
              <section>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">5. Keeping Your Information Accurate and Up To Date</h2>
                <div className="text-muted-foreground space-y-4">
                  <p>
                    It is the User's responsibility to keep the information provided to Cydex accurate and up to date. The information requested from you must be conveyed accurately and updated if there is any change.
                  </p>
                  <p>
                    You also have the right to access, correct, or delete your personal data held by Cydex. To exercise these rights, please contact us at <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">{CONTACT_EMAIL}</a> or directly via the web and mobile apps.
                  </p>
                  <p>
                    When you provide information to Cydex on behalf of someone else, you undertake that you have the right to share this information with Cydex and you are authorized to do so.
                  </p>
                </div>
              </section>

              {/* Section 6 */}
              <section>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">6. Redirecting to Third Parties</h2>
                <div className="text-muted-foreground space-y-4">
                  <p>
                    Cydex may redirect to other links that are not operated by Cydex. During your visit to any of these links, you are subject to the privacy policies and terms of use of the third party that you visit. Cydex is not responsible for the policies and practices of these third parties.
                  </p>
                </div>
              </section>

              {/* Section 7 */}
              <section>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">7. Changes to Application, Website and This Policy</h2>
                <div className="text-muted-foreground space-y-4">
                  <p>
                    Cydex, reserves the right to change, suspend or stop all provided products and services, information, images and other items without prior notice.
                  </p>
                  <p>
                    Cydex reserves the right to make changes and updates to this Policy. It is the User's responsibility to follow the current version of the Policy.
                  </p>
                </div>
              </section>

              {/* Section 8 */}
              <section>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">8. Responsibility</h2>
                <div className="text-muted-foreground space-y-4">
                  <p>
                    Cydex is not responsible for any direct or indirect damages and expenses that may occur as a result of any errors, interruptions, delays, viruses, line and/or system failures that may occur during the providing of our services electronically.
                  </p>
                </div>
              </section>

              {/* Section 9 */}
              <section>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-foreground">9. Contact Us</h2>
                <div className="text-muted-foreground space-y-4">
                  <p>For any questions or requests related to this Privacy Policy, contact us:</p>
                  <div className="bg-muted/50 p-6 rounded-lg mt-4">
                    <p><strong>Email:</strong> <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">{CONTACT_EMAIL}</a></p>
                    <p><strong>Phone:</strong> +2348028985352</p>
                    
                    <div className="mt-4">
                      <p><strong>Social Media:</strong></p>
                      <ul className="list-none space-y-2 mt-2">
                        <li><strong>X:</strong> <a href="https://x.com/cydexlogistics" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">https://x.com/cydexlogistics</a></li>
                        <li><strong>Instagram:</strong> <a href="https://www.instagram.com/cydexlogistics" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">https://www.instagram.com/cydexlogistics</a></li>
                        <li><strong>LinkedIn:</strong> <a href="https://www.linkedin.com/company/cydexlogistics" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">https://www.linkedin.com/company/cydexlogistics</a></li>
                      </ul>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </section>
      
    </SiteLayout>
  );
};

export default PrivacyPolicy; 